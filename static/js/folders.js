// ── DELETE FOLDER MODAL STATE ─────────────────────────────────
let folderToDeleteId = null;

function showDeleteFolderModal(id, name) {
  folderToDeleteId = id;

  const msg = document.getElementById('deleteFolderMsg');
  if (msg) {
    msg.innerHTML = `
      This will permanently delete <strong>${name}</strong> 
      and delete all files inside that folder.<br>
      This action cannot be undone. Do you want to proceed?
    `;
  }

  document.getElementById('modal-deleteFolder').style.display = 'flex';
}

function confirmDeleteFolder() {
  if (folderToDeleteId !== null) {
    deleteFolder(folderToDeleteId);
    folderToDeleteId = null;
  }
  hideDeleteFolderModal('deleteFolder');
}

function hideDeleteFolderModal(modalId) {
  const modal = document.getElementById('modal-' + modalId);
  if (modal) modal.style.display = 'none';
}

// ── Folders ───────────────────────────────────────────────────────────────────
async function loadFolders() {
  const res = await fetch('/api/folders');
  allFolders = await res.json();
  renderFolderGrid();
}

function setFolderSort(mode, el) {
  folderSortMode = mode;
  syncFolderSortChips(el);
  renderFolderGrid();
}

function syncFolderSortChips(activeEl) {
  document.querySelectorAll('#page-folders .sort-chip').forEach(chip => {
    chip.classList.toggle(
      'active',
      chip === activeEl || chip.dataset.sort === folderSortMode
    );
  });
}

function renderFolderGrid() {
  const el = document.getElementById('allFoldersList');
  if (!el) return;

  let sorted = [...allFolders];
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  const byCount = (a, b) => Number(b.file_count || 0) - Number(a.file_count || 0);
  const byPinned = (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));

  if (folderSortMode === 'name') sorted.sort(byName);
  if (folderSortMode === 'count') sorted.sort((a, b) => byCount(a, b) || byName(a, b));
  if (folderSortMode === 'pinned') sorted.sort((a, b) => byPinned(a, b) || byName(a, b));

  syncFolderSortChips();
  el.innerHTML = sorted.map(f => makeFolderCard(f, false)).join('');
  el.innerHTML += `<div class="add-folder-card" onclick="openCreateFolderModal()"><div class="plus">＋</div><div style="font-weight:700;font-size:0.85rem;">New Folder</div></div>`;
}

function makeFolderCard(f, minimal) {
  const icon = folderIconHtml(f.emoji, 'folder-emoji');
  const pinDot  = f.pinned ? '<div class="pinned-dot"></div>' : '';
  const count   = f.file_count || 0;
  const actions = `
    <div class="folder-top-right" onclick="event.stopPropagation()">
      <div class="folder-badge">${count}</div>
      <div class="folder-menu-wrap">
        <button class="folder-menu-btn"
          data-folder-id="${f.id}"
          data-folder-name="${escHtml(f.name)}"
          data-folder-icon="${escHtml(f.emoji)}"
          data-folder-pinned="${f.pinned ? 1 : 0}"
          data-folder-default="${f.is_default ? 1 : 0}"
          data-folder-color="${escHtml(f.color)}"
          data-folder-bg="${escHtml(f.bg)}"
          onclick="showFloatingFolderMenu(event, this)" title="Options">
          <span aria-hidden="true">⋮</span>
        </button>
      </div>
    </div>`;
  return `
    <div class="folder-card" style="--folder-color:${f.color};" onclick="openFolderFiles(${f.id},'${escHtml(f.name)}','${f.emoji}')">
      ${pinDot}
      ${actions}
      ${icon}
      <div class="folder-name">${escHtml(f.name)}</div>
      <div class="folder-count">${count} file${count!==1?'s':''}</div>
    </div>`;
}

function showFloatingFolderMenu(e, button) {
  e.stopPropagation();
  const data = button.dataset;
  const id = Number(data.folderId);
  const name = data.folderName || '';
  const emoji = data.folderIcon || 'folder';
  const pinned = Number(data.folderPinned) === 1;
  const isDefault = Number(data.folderDefault) === 1;
  const color = data.folderColor || COLOR_OPTIONS[0].val;
  const bg = data.folderBg || COLOR_OPTIONS[0].bg;
  closeFolderMenus();
  // Create or select the floating menu
  let menu = document.getElementById('floating-folder-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'floating-folder-menu';
    menu.className = 'folder-menu-dropdown open';
    document.body.appendChild(menu);
  }
  menu.innerHTML = `
    <button onclick=\"openEditModalFromEncoded(${id},'${encodeURIComponent(name)}','${encodeURIComponent(emoji)}','${encodeURIComponent(color)}','${encodeURIComponent(bg)}');closeFolderMenus()\"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/pencil.png" alt=""> Edit</button>
    <button onclick=\"togglePin(${id},${pinned});closeFolderMenus()\"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/pin.png" alt=""> ${pinned ? 'Unpin' : 'Pin'}</button>
    ${!isDefault ? `<button class='danger' onclick=\"showDeleteFolderModal(${id},decodeURIComponent('${encodeURIComponent(name)}'));closeFolderMenus()\"><img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/delete-folder.png" alt=""> Delete</button>` : ''}
  `;

  menu.style.width = '168px';
  // Position menu near button
  const rect = button.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.left = (rect.left + window.scrollX - menu.offsetWidth + rect.width) + 'px';
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  menu.style.zIndex = 99999;
  menu.style.display = 'block';
}

function closeFolderMenus() {
  const menu = document.getElementById('floating-folder-menu');
  if (menu) menu.remove();
}

// Only close menus if click is outside any menu or button
document.addEventListener('click', function(e) {
  const menu = document.getElementById('floating-folder-menu');
  if (menu && !menu.contains(e.target)) {
    closeFolderMenus();
  }
});

async function togglePin(id, currentPinned) {
  const nextPinned = currentPinned ? 0 : 1;
  const folder = allFolders.find(item => Number(item.id) === Number(id));
  const previousPinned = folder ? folder.pinned : currentPinned;

  if (folder) folder.pinned = nextPinned;
  renderFolderGrid();
  renderDashboardPinnedFoldersFromCache();

  try {
    const res = await fetch(`/api/folders/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pinned: nextPinned }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not update pin.');
    await Promise.all([loadFolders(), loadDashboard()]);
    showToast(nextPinned ? 'Folder pinned.' : 'Folder unpinned.', 'success');
  } catch (err) {
    if (folder) folder.pinned = previousPinned;
    renderFolderGrid();
    renderDashboardPinnedFoldersFromCache();
    showToast(err.message || 'Could not update folder pin.', 'error');
  }
}

function renderDashboardPinnedFoldersFromCache() {
  const pinnedEl = document.getElementById('dashPinnedFolders');
  if (!pinnedEl) return;
  const pinned = allFolders.filter(f => Number(f.pinned) === 1 || f.pinned === true);
  pinnedEl.innerHTML = pinned.length
    ? pinned.map(f => makeFolderCard(f, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;padding:20px;"><div class="es-icon"><img class="ui-icon ui-icon-lg" src="https://img.icons8.com/pulsar-color/48/folder-invoices--v2.png" alt=""></div><div class="es-text">No pinned folders yet - pin one from the Folders page!</div></div>`;
}
async function deleteFolder(id) {
  const res  = await fetch(`/api/folders/${id}`, { method:'DELETE' });
  const data = await res.json();

  if (data.success) {
    await Promise.all([loadFolders(), loadAllFiles(), loadUploadFileList(), loadDashboard(), loadStats()]);
    showToast('Folder deleted.', 'warn');
  } else {
    showToast(data.message, 'error');
  }
}

async function openFolderFiles(folderId, folderName, emoji) {
  currentFolderFilesContext = { id: folderId, name: folderName, emoji };
  document.getElementById('folderFilesTitle').innerHTML = `${folderIconHtml(emoji, 'modal-title-icon')} ${escHtml(folderName)}`;
  const listEl = document.getElementById('folderFilesList');
  listEl.innerHTML = '<div class="folder-files-loading"><div class="spinner"></div></div>';
  openModal('folderFiles');
  const res   = await fetch(`/api/files?folder_id=${folderId}&sort=${folderFilesSortMode}`);
  const files = await res.json();
  if (!files.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">📂</div><div class="es-text">No files in this folder yet.</div></div>`;
    return;
  }
  listEl.innerHTML = `
      <div class="folder-files-list">
        ${files.map(f => `
    <div class="folder-file-row">
      <div class="folder-file-icon">${getExtIcon(f.original_name)}</div>
      <div class="folder-file-main">
        <div class="folder-file-name">${escHtml(f.original_name)}</div>
        <div class="fi-meta">${getExt(f.original_name).toUpperCase()} · ${formatSize(f.file_size)} · ${timeAgo(f.created_at)}</div>
      </div>
      <span class="folder-file-size">${formatSize(f.file_size)}</span>
      ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileFromCurrentFolder(${f.id})`)}
    </div>`).join('')}
      </div>
    `;
}

function openEditModalFromEncoded(id, name, emoji, color, bg) {
  openEditModal(
    id,
    decodeURIComponent(name),
    decodeURIComponent(emoji),
    decodeURIComponent(color),
    decodeURIComponent(bg)
  );
}

function setFolderFilesSort(mode, el) {
  folderFilesSortMode = mode;
  document.querySelectorAll('.folder-files-sort .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  if (currentFolderFilesContext) {
    openFolderFiles(
      currentFolderFilesContext.id,
      currentFolderFilesContext.name,
      currentFolderFilesContext.emoji
    );
  }
}

async function deleteFileFromModal(fileId, folderId, folderName, emoji) {
  if (!confirm('Delete this file permanently?')) return;
  const res  = await fetch(`/api/files/${fileId}`, { method:'DELETE' });
  const data = await res.json();
  if (data.success) {
    await Promise.all([openFolderFiles(folderId, folderName, emoji), loadFolders()]);
    showToast('File deleted.', 'warn');
  }
  else showToast(data.message, 'error');
}

// ── Create Folder Modal ────────────────────────────────────────────────────────

function openCreateFolderModal() {
  document.getElementById('cf-name').value = '';
  document.getElementById('cf-emoji').value = '📁';
  cfModalColor = COLOR_OPTIONS[0];
  buildColorPicker('cf-colorPicker', c => { cfModalColor = c; });
  openModal('createFolder');
}

async function submitCreateFolder() {
  const btn = window.event?.currentTarget;
  const name = document.getElementById('cf-name').value.trim();
  const emoji = document.getElementById('cf-emoji').value.trim() || '📁';

  if (!name) {
    showToast('Please enter a folder name.', 'warn');
    return;
  }

  let toastMessage = '';
  let toastType = 'success';
  setButtonLoading(btn, true, 'Creating...');
  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        emoji,
        color: cfModalColor.val,
        bg: cfModalColor.bg
      })
    });

    const data = await res.json();

    if (data.success) {
      closeModal('createFolder');
      await loadFolders();
      toastMessage = 'Folder created!';
    } else {
      toastType = 'error';
      toastMessage = data.message;
    }
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

// AFTER
function openEditModal(id, name, emoji, color, bg) {
  document.getElementById('rf-id').value = id;
  document.getElementById('rf-name').value = name;
  document.getElementById('rf-emoji').value = isSystemIcon(emoji) ? '📁' : emoji;

  openModal('editFolder'); // ← open first

  // Now the container exists in the DOM
  rfModalColor = COLOR_OPTIONS.find(c => c.val === color) || COLOR_OPTIONS[0];
  buildColorPicker('rf-colorPicker', r => { rfModalColor = r; }, rfModalColor);
}

function buildColorPicker(containerId, onChange, selected) {
  const el = document.getElementById(containerId);
  el.innerHTML = COLOR_OPTIONS.map(c => `
    <div class="color-swatch ${selected && selected.val === c.val ? 'active' : ''}"
         style="background:${c.val};"
         onclick="this.parentElement.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
                  this.classList.add('active');
                  (${onChange.toString()})(${JSON.stringify(c)})">
    </div>
  `).join('');
}

async function submitEditFolder() {
  const btn = window.event?.currentTarget;
  const id = document.getElementById('rf-id').value;
  const name = document.getElementById('rf-name').value.trim();
  const emoji = document.getElementById('rf-emoji').value.trim() || '📁';

  if (!name) {
    showToast('Please enter a folder name.', 'warn');
    return;
  }

  let toastMessage = '';
  let toastType = 'success';
  setButtonLoading(btn, true, 'Saving...');
  try {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        emoji,
        color: rfModalColor.val,
        bg: rfModalColor.bg
      })
    });

    const data = await res.json();

    if (data.success) {
      window.location.reload();
    } else {
      toastType = 'error';
      toastMessage = data.message;
    }
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

async function deleteFileFromCurrentFolder(fileId) {
  if (!currentFolderFilesContext) return;
  await deleteFileFromModal(
    fileId,
    currentFolderFilesContext.id,
    currentFolderFilesContext.name,
    currentFolderFilesContext.emoji
  );
}
