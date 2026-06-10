// All files feature: list, sort, rename, move, download, and delete files.
let fileToDeleteId = null;

async function loadAllFiles(search) {
  let url = `/api/files?sort=${allFilesSortMode}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const tbody = document.getElementById('allFilesTbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;
  const res = await fetch(url);
  allFiles = await res.json();
  allFilesLoaded = true;
  sortAllFilesCache();
  renderAllFilesTable();
}

function setAllFilesSort(mode, el) {
  allFilesSortMode = mode;
  document.querySelectorAll('#page-files .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  sortAllFilesCache();
  renderAllFilesTable();
}

function sortAllFilesCache() {
  if (allFilesSortMode === 'name') allFiles.sort((a,b) => String(a.original_name || '').localeCompare(String(b.original_name || ''), undefined, { sensitivity: 'base' }));
  if (allFilesSortMode === 'folder') allFiles.sort((a,b) => String(a.folder_name || '').localeCompare(String(b.folder_name || ''), undefined, { sensitivity: 'base' }));
  if (allFilesSortMode === 'type') allFiles.sort((a,b) => getExt(a.original_name).localeCompare(getExt(b.original_name)));
  if (allFilesSortMode === 'date') allFiles.sort((a,b) => (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0));
}

function renderAllFilesTable() {
  const tbody = document.getElementById('allFilesTbody');
  if (!tbody) return;
  if (!allFiles.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="es-icon">${filledSvgIcon('file.svg', 'empty-svg-icon')}</div><div class="es-text">No files yet - upload some to get started!</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = allFiles.map(f => `
    <tr data-file-id="${f.id}">
      <td><span class="file-name-cell">${getExtIcon(f.original_name)} <span class="file-name-text" style="font-weight:700;">${escHtml(f.original_name)}</span>${newFileBadge(f.created_at)}${f.ai_sorted?' <span style="font-size:0.65rem;background:var(--lavender2);color:var(--lavender);padding:1px 6px;border-radius:8px;font-weight:800;">AI</span>':''}</span></td>
      <td><span style="font-size:0.72rem;background:var(--bg);padding:2px 8px;border-radius:6px;font-weight:700;color:var(--text2);">${getExt(f.original_name).toUpperCase()||'—'}</span></td>
      <td><span class="file-folder-tag" style="background:${f.folder_bg};color:${f.folder_color};">${folderIconHtml(f.folder_emoji, 'file-folder-icon')} ${escHtml(f.folder_name)}</span></td>
      <td style="color:var(--text3);font-size:0.82rem;">${formatSize(f.file_size)}</td>
      <td style="color:var(--text3);font-size:0.82rem;">${timeAgo(f.created_at)}</td>
      <td class="file-actions-cell">
        ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileById(${f.id})`)}
      </td>
    </tr>`).join('');
}

function fileActionsButton(fileId, folderId, name, deleteAction) {
  const encodedName = encodeURIComponent(name || '');
  return `
    <button class="folder-menu-btn file-menu-trigger"
      onclick="showFloatingFileMenu(event, ${fileId}, ${folderId}, '${encodedName}', '${escHtml(deleteAction)}')"
      title="File actions">
      <span aria-hidden="true">⋮</span>
    </button>
  `;
}

function showFloatingFileMenu(e, fileId, folderId, encodedName, deleteAction) {
  e.stopPropagation();
  closeFileMenus();
  closeFolderMenus?.();
  let menu = document.getElementById('floating-file-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'floating-file-menu';
    menu.className = 'folder-menu-dropdown open';
    document.body.appendChild(menu);
  }

  menu.innerHTML = `
    <button onclick="openFile(${fileId});closeFileMenus()">${svgIcon('view.svg', 'action-svg-icon')} Preview</button>
    <button onclick="openRenameFileModal(${fileId}, '${encodedName}');closeFileMenus()">${svgIcon('edit.svg', 'action-svg-icon')} Rename</button>
    <button onclick="openMoveFileModal(${fileId},${folderId});closeFileMenus()">${svgIcon('move.svg', 'action-svg-icon')} Move</button>
    <button onclick="downloadFile(${fileId},'');closeFileMenus()">${svgIcon('download.svg', 'action-svg-icon')} Download</button>
    <button class="danger" onclick="${deleteAction};closeFileMenus()">${svgIcon('delete.svg', 'action-svg-icon')} Delete</button>
  `;

  const rect = e.currentTarget.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.left = (rect.left + window.scrollX - 128 + rect.width) + 'px';
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  menu.style.zIndex = 99999;
  menu.style.display = 'block';
}

function closeFileMenus() {
  const menu = document.getElementById('floating-file-menu');
  if (menu) menu.remove();
}

function openRenameFileModal(fileId, encodedName) {
  fileToRenameId = fileId;
  const input = document.getElementById('renameFileInput');
  if (input) {
    input.value = decodeURIComponent(encodedName || '');
    setTimeout(() => input.focus(), 0);
  }
  openModal('renameFile');
}

async function submitRenameFile() {
  if (!fileToRenameId) return;
  const btn = window.event?.currentTarget;
  const input = document.getElementById('renameFileInput');
  const name = (input?.value || '').trim();
  let toastMessage = '';
  let toastType = 'success';

  if (!name) {
    showToast('Please enter a file name.', 'warn');
    return;
  }

  setButtonLoading(btn, true, 'Renaming...');
  try {
    const res = await fetch(`/api/files/${fileToRenameId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!data.success) {
      toastType = 'error';
      toastMessage = data.message || 'Could not rename file.';
      return;
    }

    closeModal('renameFile');
    renameCachedFile(fileToRenameId, data.name || name);
    fileToRenameId = null;
    toastMessage = 'File renamed.';
    syncCachesSilently();
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

document.addEventListener('click', function(e) {
  const menu = document.getElementById('floating-file-menu');
  if (menu && !menu.contains(e.target)) closeFileMenus();
});

async function openMoveFileModal(fileId, currentFolderId) {
  fileToMoveId = fileId;
  if (!allFolders.length) await loadFolders();
  const select = document.getElementById('moveFileFolder');
  select.innerHTML = allFolders.map(f => `
    <option value="${f.id}" ${Number(f.id) === Number(currentFolderId) ? 'selected' : ''}>
      ${escHtml(f.name)}
    </option>
  `).join('');
  openModal('moveFile');
}

async function submitMoveFile() {
  if (!fileToMoveId) return;
  const btn = window.event?.currentTarget;
  const folderId = document.getElementById('moveFileFolder').value;
  let toastMessage = '';
  let toastType = 'success';
  setButtonLoading(btn, true, 'Moving...');
  try {
    const res = await fetch(`/api/files/${fileToMoveId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: Number(folderId) }),
    });
    const data = await res.json();
    if (!data.success) {
      toastType = 'error';
      toastMessage = data.message || 'Could not move file.';
      return;
    }
    closeModal('moveFile');
    moveCachedFile(fileToMoveId, folderId);
    fileToMoveId = null;
    toastMessage = 'File moved.';
    syncCachesSilently();
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

function openDeleteFileModal(fileId) {
  fileToDeleteId = fileId;
  const file = getCachedFile(fileId);
  const msg = document.getElementById('deleteFileMsg');
  if (msg) {
    const fileName = file?.original_name
      ? `<strong>${escHtml(file.original_name)}</strong>`
      : 'this file';
    msg.innerHTML = `This will permanently delete ${fileName}. This action cannot be undone.`;
  }
  openModal('deleteFile');
}

async function confirmDeleteFile(button) {
  if (!fileToDeleteId) return;
  const fileId = fileToDeleteId;
  fileToDeleteId = null;
  await deleteFileById(fileId, button, true);
}

async function deleteFileById(id, button, confirmed = false) {
  if (!confirmed) {
    openDeleteFileModal(id);
    return;
  }
  const btn = button || window.event?.currentTarget;
  let toastMessage = '';
  let toastType = 'warn';
  setButtonLoading(btn, true, 'Deleting...');
  try {
    const res  = await fetch(`/api/files/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeModal('deleteFile');
      removeCachedFile(id);
      toastMessage = 'File deleted.';
      syncCachesSilently();
    } else {
      toastType = 'error';
      toastMessage = data.message;
    }
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}
