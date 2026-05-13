// ── All Files ──────────────────────────────────────────────────────────────────
async function loadAllFiles(search) {
  let url = `/api/files?sort=${allFilesSortMode}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const tbody = document.getElementById('allFilesTbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;
  const res = await fetch(url);
  allFiles = await res.json();
  renderAllFilesTable();
}

function setAllFilesSort(mode, el) {
  allFilesSortMode = mode;
  document.querySelectorAll('#page-files .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  loadAllFiles();
}

function renderAllFilesTable() {
  const tbody = document.getElementById('allFilesTbody');
  if (!allFiles.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3);">No files yet. Upload some to get started!</td></tr>`;
    return;
  }
  tbody.innerHTML = allFiles.map(f => `
    <tr data-file-id="${f.id}">
      <td><span class="file-name-cell">${getExtIcon(f.original_name)} <span class="file-name-text" style="font-weight:700;">${escHtml(f.original_name)}</span>${f.ai_sorted?' <span style="font-size:0.65rem;background:var(--lavender2);color:var(--lavender);padding:1px 6px;border-radius:8px;font-weight:800;">AI</span>':''}</span></td>
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
    <button onclick="openFile(${fileId});closeFileMenus()"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/preview-file.png" alt=""> Preview</button>
    <button onclick="openRenameFileModal(${fileId}, '${encodedName}');closeFileMenus()"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/rename.png" alt=""> Rename</button>
    <button onclick="openMoveFileModal(${fileId},${folderId});closeFileMenus()"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/right.png" alt=""> Move</button>
    <button onclick="downloadFile(${fileId},'');closeFileMenus()"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/downloading-updates.png" alt=""> Download</button>
    <button class="danger" onclick="${deleteAction};closeFileMenus()"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/delete-file.png" alt=""> Delete</button>
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
    fileToRenameId = null;
    await Promise.all([loadAllFiles(), loadUploadFileList(), loadDashboard(), loadStats()]);
    if (currentFolderFilesContext && document.getElementById('modal-folderFiles')?.classList.contains('open')) {
      await openFolderFiles(
        currentFolderFilesContext.id,
        currentFolderFilesContext.name,
        currentFolderFilesContext.emoji
      );
    }
    toastMessage = 'File renamed.';
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
    fileToMoveId = null;
    await Promise.all([loadAllFiles(), loadFolders(), loadUploadFileList()]);
    if (currentFolderFilesContext && document.getElementById('modal-folderFiles')?.classList.contains('open')) {
      openFolderFiles(
        currentFolderFilesContext.id,
        currentFolderFilesContext.name,
        currentFolderFilesContext.emoji
      );
    }
    toastMessage = 'File moved.';
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

async function deleteFileById(id) {
  if (!confirm('Delete this file permanently?')) return;
  const btn = window.event?.currentTarget;
  let toastMessage = '';
  let toastType = 'warn';
  setButtonLoading(btn, true, 'Deleting...');
  try {
    const res  = await fetch(`/api/files/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (data.success) {
      await Promise.all([loadAllFiles(), loadFolders()]);
      toastMessage = 'File deleted.';
    } else {
      toastType = 'error';
      toastMessage = data.message;
    }
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}
