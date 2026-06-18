// All files feature: list, sort, rename, move, download, and delete files.

async function loadAllFiles(search, forceFresh = false) {
  let url = `/api/files?sort=${fileSortApiParam(allFilesSortMode)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const tbody = document.getElementById('allFilesTbody');
  if (!search && !forceFresh && hasAuthenticatedAppData()) {
    sortAllFilesCache();
    renderAllFilesTable();
    syncCachesSilently();
    return;
  }
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;
  if (!search) {
    await fetchFreshAuthenticatedAppData();
    return;
  }
  const res = await fetch(url);
  allFiles = await res.json();
  allFilesLoaded = true;
  sortAllFilesCache();
  renderAllFilesTable();
}

function updateAllFilesSortLabel() {
  const field = getSortModeField(allFilesSortMode) === 'name' ? 'Name' : 'Date Created';
  const direction = getSortModeDirection(allFilesSortMode) === 'asc' ? 'Ascending' : 'Descending';
  setCustomDropdownLabel('allFilesSortLabel', `${field} - ${direction}`);
}

function setAllFilesSortField(field, option) {
  allFilesSortMode = updateSortModeField(allFilesSortMode, field);
  selectCustomDropdownOption(option);
  updateAllFilesSortLabel();
  closeCustomDropdowns();
  sortAllFilesCache();
  renderAllFilesTable();
}

function setAllFilesSortDirection(direction, option) {
  allFilesSortMode = updateSortModeDirection(allFilesSortMode, direction);
  selectCustomDropdownOption(option);
  updateAllFilesSortLabel();
  closeCustomDropdowns();
  sortAllFilesCache();
  renderAllFilesTable();
}

function setAllFilesTypeFilter(type, option) {
  allFilesTypeFilter = type;
  selectCustomDropdownOption(option);
  if (option) setCustomDropdownLabel('allFilesTypeLabel', option.textContent.trim());
  closeCustomDropdowns();
  renderAllFilesTable();
}

function sortAllFilesCache() {
  sortFilesByMode(allFiles, allFilesSortMode);
}

function renderAllFilesTable() {
  const tbody = document.getElementById('allFilesTbody');
  if (!tbody) return;
  const files = filterFilesByType(allFiles, allFilesTypeFilter);
  if (!files.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="es-icon">${filledSvgIcon('file.svg', 'empty-svg-icon')}</div><div class="es-text">No files yet - upload some to get started!</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = files.map(f => `
    <tr class="file-folder-link" data-file-id="${f.id}" role="button" tabindex="0" onclick="openFileFolder(${f.id})" onkeydown="handleFileFolderKeydown(event, ${f.id})">
      <td><span class="file-name-cell">${getExtIcon(f.original_name)} <span class="file-name-text" style="font-weight:700;">${escHtml(f.original_name)}</span>${newFileBadge(f.created_at)}</span></td>
      <td><span style="font-size:0.72rem;background:var(--bg);padding:2px 8px;border-radius:6px;font-weight:700;color:var(--text2);">${getExt(f.original_name).toUpperCase()||'—'}</span></td>
      <td><span class="file-folder-tag" style="background:${f.folder_bg};color:${f.folder_color};">${folderIconHtml(f.folder_emoji, 'file-folder-icon')} ${escHtml(f.folder_name)}</span></td>
      <td style="color:var(--text3);font-size:0.82rem;">${formatSize(f.file_size)}</td>
      <td style="color:var(--text3);font-size:0.82rem;">${timeAgo(f.created_at)}</td>
      <td class="file-actions-cell">
        <div class="file-actions-group">
          ${fileSummaryButton(f)}
          ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileById(${f.id})`)}
        </div>
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

async function submitRenameFile(button) {
  if (!fileToRenameId) return;
  const btn = getActionButton(button);
  const input = document.getElementById('renameFileInput');
  const name = (input?.value || '').trim();

  if (!name) {
    showToast('Please enter a file name.', 'warn');
    return;
  }

  await beginButtonAction(btn, 'Renaming...');
  try {
    const res = await fetch(`/api/files/${fileToRenameId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Could not rename file.', 'error');
      return;
    }

    closeModal('renameFile');
    renameCachedFile(fileToRenameId, data.name || name);
    fileToRenameId = null;
    showToast('File renamed.', 'success');
    syncCachesSilently();
  } finally {
    setButtonLoading(btn, false);
  }
}

document.addEventListener('click', function(e) {
  const menu = document.getElementById('floating-file-menu');
  if (menu && !menu.contains(e.target)) closeFileMenus();
});

async function openMoveFileModal(fileId, currentFolderId) {
  fileToMoveId = fileId;
  if (!allFolders.length) await loadFolders();
  const input = document.getElementById('moveFileFolder');
  const label = document.getElementById('moveFileFolderLabel');
  const options = document.getElementById('moveFileFolderOptions');
  const selected = allFolders.find(f => Number(f.id) === Number(currentFolderId)) || allFolders[0];

  if (input) input.value = selected?.id || '';
  if (label) label.textContent = selected?.name || 'Select folder';
  if (options) {
    options.innerHTML = allFolders.map(f => {
      const encodedName = encodeURIComponent(f.name || 'Folder');
      const selectedClass = Number(f.id) === Number(selected?.id) ? ' selected' : '';
      return `<button type="button" class="fn-dropdown-option${selectedClass}" onclick="setMoveFileFolder(${f.id}, '${encodedName}', this)">${escHtml(f.name)}</button>`;
    }).join('');
  }
  openModal('moveFile');
}

function setMoveFileFolder(folderId, encodedName, option) {
  const input = document.getElementById('moveFileFolder');
  if (input) input.value = folderId;
  selectCustomDropdownOption(option);
  setCustomDropdownLabel('moveFileFolderLabel', decodeURIComponent(encodedName || 'Folder'));
  closeCustomDropdowns();
}

async function submitMoveFile(button) {
  if (!fileToMoveId) return;
  const btn = getActionButton(button);
  const folderId = document.getElementById('moveFileFolder').value;
  await beginButtonAction(btn, 'Moving...');
  try {
    const res = await fetch(`/api/files/${fileToMoveId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: Number(folderId) }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Could not move file.', 'error');
      return;
    }
    closeModal('moveFile');
    moveCachedFile(fileToMoveId, folderId);
    fileToMoveId = null;
    showToast('File moved.', 'success');
    syncCachesSilently();
  } finally {
    setButtonLoading(btn, false);
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
  const btn = getActionButton(button);
  await beginButtonAction(btn, 'Deleting...');
  try {
    const res  = await fetch(`/api/files/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeModal('deleteFile');
      removeCachedFile(id);
      showToast('File deleted.', 'success');
      syncCachesSilently();
    } else {
      showToast(data.message, 'error');
    }
  } finally {
    setButtonLoading(btn, false);
  }
}
