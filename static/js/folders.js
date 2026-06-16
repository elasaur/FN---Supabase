// Folder deletion modal state.
let folderToDeleteId = null;

// Opens the delete-folder confirmation modal for the selected folder.
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

  const modal = document.getElementById('modal-deleteFolder');
  modal.style.display = 'flex';
  modal.classList.add('open');
  if (typeof restartModalIconAnimation === 'function') restartModalIconAnimation(modal);
}

// Confirms the pending folder deletion and closes the confirmation modal.
function confirmDeleteFolder() {
  if (folderToDeleteId !== null) {
    deleteFolder(folderToDeleteId);
    folderToDeleteId = null;
  }
  hideDeleteFolderModal('deleteFolder');
}

// Hides a delete modal by its modal id suffix.
function hideDeleteFolderModal(modalId) {
  const modal = document.getElementById('modal-' + modalId);
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
}

// Folders feature: list, sort, pin, open, edit, note, and delete folders.
// Loads folders from the API and renders the folder grid.
async function loadFolders() {
  setFoldersLoading();
  try {
    const res = await fetch('/api/folders');
    if (!res.ok) throw new Error('Could not load folders.');
    allFolders = await res.json();
    renderFolderGrid();
  } catch (err) {
    renderFoldersLoadError(err);
    showToast(err.message || 'Could not load folders.', 'error');
  }
}

// Shows a loading state in the folder grid.
function setFoldersLoading() {
  const el = document.getElementById('allFoldersList');
  if (!el) return;
  el.innerHTML = '<div class="section-loading" role="status" aria-live="polite"><div class="spinner" aria-label="Loading folders"></div></div>';
}

// Shows the folder loading error state with a retry button.
function renderFoldersLoadError(err) {
  const el = document.getElementById('allFoldersList');
  if (!el) return;
  el.innerHTML = `
    <div class="folders-load-error">
      <div class="es-icon">${filledSvgIcon('warning.svg', 'empty-svg-icon')}</div>
      <div class="es-text">${escHtml(err.message || 'Could not load folders.')}</div>
      <button class="btn btn-ghost" onclick="loadFolders()">Try again</button>
    </div>
  `;
}

// Updates the active folder sort mode and rerenders the grid.
function setFolderSort(mode, el) {
  // Date columns toggle direction each time the same chip is clicked.
  if (mode === 'created' || mode === 'modified') {
    const descMode = `${mode}-desc`;
    const ascMode = `${mode}-asc`;
    folderSortMode = folderSortMode === descMode ? ascMode : descMode;
  } else {
    folderSortMode = mode;
  }
  syncFolderSortChips(el);
  renderFolderGrid();
}

// Keeps folder sort chips visually aligned with the active sort mode.
function syncFolderSortChips(activeEl) {
  document.querySelectorAll('#page-folders .sort-chip').forEach(chip => {
    const chipSort = chip.dataset.sort;
    const isDateChip = chipSort === 'created' || chipSort === 'modified';
    const isActive = isDateChip
      ? folderSortMode.startsWith(`${chipSort}-`)
      : chipSort === folderSortMode;

    chip.classList.toggle(
      'active',
      chip === activeEl || isActive
    );

    if (isDateChip) {
      const baseLabel = chipSort === 'created' ? 'Created Date' : 'Modified Date';
      // Date chip labels include the active direction indicator.
      chip.textContent = isActive
        ? `${baseLabel} ${folderSortMode.endsWith('-asc') ? '↑' : '↓'}`
        : baseLabel;
      chip.title = `${baseLabel}: click to sort ${folderSortMode.endsWith('-desc') && isActive ? 'oldest first' : 'newest first'}`;
    }
  });
}

// Renders all folders, sorted and with pinned folders first.
function renderFolderGrid() {
  const el = document.getElementById('allFoldersList');
  if (!el) return;

  let sorted = [...allFolders];
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  const byCount = (a, b) => Number(b.file_count || 0) - Number(a.file_count || 0);
  const byPinned = (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));

  // Modified folders use updated_at first, then note_updated_at, then created_at.
  const folderDateValue = (folder, field) => {
    const value = field === 'updated_at'
      ? (folder.updated_at || folder.note_updated_at || folder.created_at)
      : folder.created_at;
    return parseAppDate(value)?.getTime() || 0;
  };
  const sorters = {
    name: byName,
    count: byCount,
    'created-asc': (a, b) => folderDateValue(a, 'created_at') - folderDateValue(b, 'created_at'),
    'created-desc': (a, b) => folderDateValue(b, 'created_at') - folderDateValue(a, 'created_at'),
    'modified-asc': (a, b) => folderDateValue(a, 'updated_at') - folderDateValue(b, 'updated_at'),
    'modified-desc': (a, b) => folderDateValue(b, 'updated_at') - folderDateValue(a, 'updated_at'),
  };
  const bySelectedMode = sorters[folderSortMode] || byName;

  // Keep pinned folders first, then apply selected sorting, then use name as fallback.
  sorted.sort((a, b) => byPinned(a, b) || bySelectedMode(a, b) || byName(a, b));

  syncFolderSortChips();
  el.innerHTML = sorted.map(f => makeFolderCard(f, false)).join('');
  el.innerHTML += `<div class="add-folder-card" onclick="openCreateFolderModal()"><div class="plus">＋</div><div style="font-weight:700;font-size:0.85rem;">New Folder</div></div>`;
}

// Builds the HTML for one folder card.
function makeFolderCard(f, minimal) {
  const icon = folderIconHtml(f.emoji, 'folder-emoji');
  const pinDot  = f.pinned ? '<div class="pinned-dot"></div>' : '';
  const count   = f.file_count || 0;
  const created = f.created_at ? `Created ${timeAgo(f.created_at)}` : 'Created date unavailable';
  const notePreview = renderFolderNotePreview(f);
  const encodedName = encodeURIComponent(f.name || '');
  const encodedEmoji = encodeURIComponent(f.emoji || 'folder');
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
    <div class="folder-card" style="--folder-color:${f.color};" onclick="openFolderCard(${f.id},'${encodedName}','${encodedEmoji}')">
      ${pinDot}
      ${actions}
      ${icon}
      <div class="folder-name">${escHtml(f.name)}</div>
      <div class="folder-count">${count} file${count!==1?'s':''}</div>
      <div class="folder-created">${escHtml(created)}</div>
      ${notePreview}
    </div>`;
}

// Opens a folder card using encoded values from inline HTML handlers.
function openFolderCard(folderId, encodedName, encodedEmoji) {
  openFolderFiles(
    folderId,
    decodeURIComponent(encodedName || ''),
    decodeURIComponent(encodedEmoji || 'folder')
  );
}

// Renders a short preview of the folder note for the folder card.
function renderFolderNotePreview(folder) {
  const body = String(folder.note_body || '').trim();
  if (!body) return '<div class="fc-note-preview fc-note-empty">No note yet.</div>';

  // Only preview the first two non-empty lines to keep folder cards compact.
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2);

  const preview = lines.map(line => {
    // Checklist markers affect preview styling, then get removed from visible text.
    const done = /^\[[xX]\]\s*/.test(line);
    const pending = /^(\[\]|\[ \])\s*/.test(line);
    const text = stripFolderNoteMarkdown(line.replace(/^(\[[xX]\]|\[\]|\[ \])\s*/, ''));
    const cls = done ? 'done' : pending ? 'check' : '';
    return `<span class="${cls}">${escHtml(text)}</span>`;
  }).join(' ');

  return `<div class="fc-note-preview">${preview}</div>`;
}

// Removes lightweight note markdown before showing preview text.
function stripFolderNoteMarkdown(value) {
  return String(value || '')
    .replace(/^#\s+/, '')
    .replace(/\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g, '$1');
}

// Splits the saved folder note into title and body fields.
function splitFolderNoteBody(value) {
  const lines = String(value || '').split(/\r?\n/);
  const firstLine = lines[0] || '';

  // A leading "# " line is treated as the note title.
  if (/^#\s+/.test(firstLine)) {
    return {
      title: firstLine.replace(/^#\s+/, '').trim(),
      body: lines.slice(1).join('\n').replace(/^\n+/, ''),
    };
  }
  return { title: '', body: String(value || '') };
}

// Combines the note title and body into the stored note format.
function composeFolderNoteBody(title, body) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').replace(/^\n+/, '');
  return cleanTitle ? `# ${cleanTitle}${cleanBody ? `\n${cleanBody}` : ''}` : cleanBody;
}

// Shows the floating menu for a folder card action button.
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

  // Floating action menu for edit, pin, and delete commands.
  let menu = document.getElementById('floating-folder-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'floating-folder-menu';
    menu.className = 'folder-menu-dropdown open';
    document.body.appendChild(menu);
  }

  menu.innerHTML = `
    <button onclick=\"openEditModalFromEncoded(${id},'${encodeURIComponent(name)}','${encodeURIComponent(emoji)}','${encodeURIComponent(color)}','${encodeURIComponent(bg)}');closeFolderMenus()\">${svgIcon('edit.svg', 'action-svg-icon')} Edit</button>
    <button onclick=\"togglePin(${id},${pinned});closeFolderMenus()\">${svgIcon('pin-folder.svg', 'action-svg-icon')} ${pinned ? 'Unpin' : 'Pin'}</button>
    ${!isDefault ? `<button class='danger' onclick=\"showDeleteFolderModal(${id},decodeURIComponent('${encodeURIComponent(name)}'));closeFolderMenus()\">${svgIcon('delete.svg', 'action-svg-icon')} Delete</button>` : ''}
  `;

  menu.style.width = '168px';

  // Keep the menu anchored to the clicked options button.
  const rect = button.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.left = (rect.left + window.scrollX - menu.offsetWidth + rect.width) + 'px';
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  menu.style.zIndex = 99999;
  menu.style.display = 'block';
}

// Removes the floating folder menu if it exists.
function closeFolderMenus() {
  const menu = document.getElementById('floating-folder-menu');
  if (menu) menu.remove();
}

// Close folder menus when the user clicks elsewhere.
document.addEventListener('click', function(e) {
  const menu = document.getElementById('floating-folder-menu');
  if (menu && !menu.contains(e.target)) {
    closeFolderMenus();
  }
});

// Toggles a folder pin state with optimistic UI and rollback on failure.
async function togglePin(id, currentPinned) {
  const nextPinned = currentPinned ? 0 : 1;
  const folder = allFolders.find(item => Number(item.id) === Number(id));
  const previousPinned = folder ? folder.pinned : currentPinned;

  // Optimistically update local cache so the UI responds immediately.
  if (folder) folder.pinned = nextPinned;
  renderFolderGrid();
  renderDashboardPinnedFoldersFromCache();

  try {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: nextPinned }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not update pin.');

    if (folder) folder.updated_at = data.updated_at || new Date().toISOString();
    showToast(nextPinned ? 'Folder pinned.' : 'Folder unpinned.', 'success');
    syncCachesSilently();
  } catch (err) {
    // Restore previous local state when the API update fails.
    if (folder) folder.pinned = previousPinned;
    renderFolderGrid();
    renderDashboardPinnedFoldersFromCache();
    showToast(err.message || 'Could not update folder pin.', 'error');
  }
}

// Renders pinned folders on the dashboard from the local folder cache.
function renderDashboardPinnedFoldersFromCache() {
  const pinnedEl = document.getElementById('dashPinnedFolders');
  if (!pinnedEl) return;

  const pinned = allFolders.filter(f => Number(f.pinned) === 1 || f.pinned === true);

  pinnedEl.innerHTML = pinned.length
    ? pinned.map(f => makeFolderCard(f, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;padding:20px;"><div class="es-icon">${filledSvgIcon('pin-folder.svg', 'empty-svg-icon')}</div><div class="es-text">No pinned folders yet - pin one from the Folders page!</div></div>`;
}

// Deletes a folder and updates local caches after success.
async function deleteFolder(id) {
  const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
  const data = await res.json();

  if (data.success) {
    removeCachedFolder(id);
    showToast('Folder deleted.', 'warn');
    syncCachesSilently();
  } else {
    showToast(data.message, 'error');
  }
}

// Opens the folder detail page and loads files for that folder.
async function openFolderFiles(folderId, folderName, emoji) {
  const folder = getCachedFolder(folderId) || { id: folderId, name: folderName, emoji, note_body: '' };
  currentFolderFilesContext = { id: folderId, name: folderName, emoji };

  const title = document.getElementById('folderFilesTitle');
  if (title) title.innerHTML = `${folderIconHtml(emoji, 'modal-title-icon')} ${escHtml(folderName)}`;

  const detailPage = document.getElementById('page-folder-detail');
  if (detailPage) detailPage.style.setProperty('--folder-color', folder.color || COLOR_OPTIONS[0].val);

  navigate('folder-detail');

  const topbar = document.getElementById('topbarTitle');
  if (topbar) topbar.textContent = 'All Folders';

  renderFolderNoteTab(folder);

  // Use cached files when available; otherwise show loading while fetching once.
  if (allFilesLoaded) {
    renderCurrentFolderFilesFromCache();
    return;
  }

  const countEl = document.getElementById('folderFilesCount');
  if (countEl) countEl.textContent = 'Loading...';

  const listEl = document.getElementById('folderFilesList');
  listEl.innerHTML = '<div class="folder-files-loading"><div class="spinner"></div></div>';

  await loadAllFiles();
  renderCurrentFolderFilesFromCache();
}

// Loads the selected folder note into the title and editor fields.
function renderFolderNoteTab(folder) {
  const folderNoteBody = String(folder?.note_body || '');
  folderNoteDirty = false;

  // Stored notes keep the title as a markdown-style first line.
  const noteParts = splitFolderNoteBody(folderNoteBody);
  const titleInput = document.getElementById('folderNoteTitle');

  if (titleInput) {
    bindFolderNoteTitle(titleInput);
    titleInput.value = noteParts.title;
  }

  const editor = document.getElementById('folderNoteEditor');
  if (editor) {
    bindFolderNoteEditor(editor);
    if (typeof setNoteEditorBody === 'function') {
      setNoteEditorBody(noteParts.body, editor);
    } else {
      editor.textContent = noteParts.body;
    }
  }

  const saved = document.getElementById('folderNoteSavedAt');
  if (saved) {
    saved.textContent = folder?.note_updated_at ? `Last saved ${timeAgo(folder.note_updated_at)}` : 'Not saved yet';
  }

  updateFolderNoteActions();
}

// Registers the folder note title input dirty-state handler once.
function bindFolderNoteTitle(input) {
  if (input.dataset.folderNoteTitleBound) return;
  input.dataset.folderNoteTitleBound = '1';
  input.addEventListener('input', () => {
    folderNoteDirty = true;
    updateFolderNoteActions();
  });
}

// Registers the folder note editor handlers once.
function bindFolderNoteEditor(editor) {
  if (editor.dataset.folderNoteBound) return;
  editor.dataset.folderNoteBound = '1';
  if (typeof getNoteEditor === 'function') getNoteEditor(editor);
}

// Enables or disables note action buttons based on dirty state.
function updateFolderNoteActions() {
  const save = document.getElementById('folderNoteSaveBtn');
  const cancel = document.getElementById('folderNoteCancelBtn');

  if (save) {
    save.disabled = !folderNoteDirty;
    save.classList.toggle('is-dirty', folderNoteDirty);
  }

  if (cancel) cancel.disabled = !folderNoteDirty;
}

// Saves the current folder note to the API and updates the local cache.
async function saveFolderNote(folderId, btn) {
  const editor = document.getElementById('folderNoteEditor');
  const titleInput = document.getElementById('folderNoteTitle');

  // Use the rich note serializer when loaded; otherwise fall back to plain text.
  const editorBody = typeof serializeNoteEditorBody === 'function'
    ? serializeNoteEditorBody(editor)
    : String(editor?.textContent || '');
  const body = composeFolderNoteBody(titleInput?.value, editorBody);
  let data = null;

  await withButtonLoading(btn, 'Saving...', async () => {
    data = await apiPut(`/api/folders/${folderId}/note`, { note_body: body });
  });

  if (!data?.success) {
    showToast(data?.message || 'Could not save folder note.', 'error');
    return;
  }

  updateCachedFolder(folderId, {
    note_body: data.note_body,
    note_updated_at: data.note_updated_at,
    updated_at: data.updated_at || data.note_updated_at,
  });
  folderNoteDirty = false;

  renderFolderNoteTab(getCachedFolder(folderId));
  showToast('Folder note saved.', 'success');
}

// Restores the note editor to the last saved folder note.
function cancelFolderNote() {
  if (!currentFolderFilesContext) return;
  renderFolderNoteTab(getCachedFolder(currentFolderFilesContext.id));
}

// Decodes folder values from inline HTML handlers before opening edit modal.
function openEditModalFromEncoded(id, name, emoji, color, bg) {
  openEditModal(
    id,
    decodeURIComponent(name),
    decodeURIComponent(emoji),
    decodeURIComponent(color),
    decodeURIComponent(bg)
  );
}

// Renders the currently opened folder's files from the local file cache.
function renderCurrentFolderFilesFromCache() {
  if (!currentFolderFilesContext || !document.getElementById('page-folder-detail')?.classList.contains('active')) return;

  const listEl = document.getElementById('folderFilesList');
  const countEl = document.getElementById('folderFilesCount');
  if (!listEl) return;

  const files = allFiles.filter(f => Number(f.folder_id) === Number(currentFolderFilesContext.id));

  // Sort only the filtered list for the currently opened folder.
  if (folderFilesSortMode === 'name') {
    files.sort((a, b) => String(a.original_name || '').localeCompare(String(b.original_name || ''), undefined, { sensitivity: 'base' }));
  }
  if (folderFilesSortMode === 'type') {
    files.sort((a, b) => getExt(a.original_name).localeCompare(getExt(b.original_name)));
  }
  if (folderFilesSortMode === 'date') {
    files.sort((a, b) => (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0));
  }

  if (countEl) countEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;

  if (!files.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">${filledSvgIcon('file.svg', 'empty-svg-icon')}</div><div class="es-text">No files in this folder yet.</div></div>`;
    return;
  }

  listEl.innerHTML = `
      <div class="folder-files-list">
        ${files.map(f => {
          const folderName = f.folder_name || currentFolderFilesContext.name;
          const folderEmoji = f.folder_emoji || currentFolderFilesContext.emoji;
          const folderBg = f.folder_bg || 'var(--accent3)';
          const folderColor = f.folder_color || 'var(--accent)';
          return `
    <div class="folder-file-row file-folder-link" role="button" tabindex="0" onclick="openFileFolder(${f.id})" onkeydown="handleFileFolderKeydown(event, ${f.id})">
      <div class="folder-file-icon">${getExtIcon(f.original_name)}</div>
      <div class="folder-file-main">
        <div class="folder-file-name">${escHtml(f.original_name)}${newFileBadge(f.created_at)}</div>
        <div class="fi-meta">
          <span class="fi-folder" style="background:${folderBg};color:${folderColor};">${folderIconHtml(folderEmoji, 'file-folder-icon')} ${escHtml(folderName)}</span>
          <span>${getExt(f.original_name).toUpperCase() || 'FILE'}</span>
          <span>${formatSize(f.file_size)}</span>
        </div>
      </div>
      <span class="folder-file-date">${timeAgo(f.created_at)}</span>
      ${fileSummaryButton(f)}
      ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileFromCurrentFolder(${f.id})`)}
    </div>`;
        }).join('')}
      </div>
    `;
}

// Updates folder-detail file sort mode and rerenders the file list.
function setFolderFilesSort(mode, el) {
  folderFilesSortMode = mode;
  document.querySelectorAll('.folder-files-sort .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderCurrentFolderFilesFromCache();
}

// Deletes a file from the folder detail context.
async function deleteFileFromModal(fileId, folderId, folderName, emoji) {
  deleteFileById(fileId);
}

// Folder modal feature: create and edit folder names, icons, and colors.
let cfModalColor = COLOR_OPTIONS[0];
let rfModalColor = COLOR_OPTIONS[0];

// Opens the create-folder modal with default values.
function openCreateFolderModal() {
  document.getElementById('cf-name').value = '';
  document.getElementById('cf-emoji').value = '📁';
  cfModalColor = COLOR_OPTIONS[0];
  buildFolderModalColorPicker('cf-colorPicker', c => { cfModalColor = c; });
  openModal('createFolder');
}

// Creates a folder from the create-folder modal form.
async function submitCreateFolder(button) {
  const btn = getActionButton(button);
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
        bg: cfModalColor.bg,
      }),
    });

    const data = await res.json();

    if (data.success) {
      closeModal('createFolder');
      if (data.folder) {
        allFolders.push(data.folder);
        renderEverywhereFromCache();
      } else {
        syncCachesSilently();
      }
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

// Opens the edit-folder modal with the selected folder values.
function openEditModal(id, name, emoji, color, bg) {
  const selectedColor = COLOR_OPTIONS.find(c => c.val === color) || COLOR_OPTIONS[0];
  rfModalColor = selectedColor;

  document.getElementById('rf-id').value = id;
  document.getElementById('rf-name').value = name;
  document.getElementById('rf-emoji').value = isIconUrl(emoji) ? '📁' : emoji;

  openModal('editFolder');

  // Build color choices after the modal DOM is visible.
  const onColorChange = r => { rfModalColor = r; };
  buildFolderModalColorPicker('rf-colorPicker', onColorChange, selectedColor);
}

// Builds color swatches for create/edit folder modals.
function buildFolderModalColorPicker(containerId, onChange, selected) {
  const el = document.getElementById(containerId);
  const selectedColor = selected || COLOR_OPTIONS[0];

  el.innerHTML = COLOR_OPTIONS.map(c => `
    <button type="button"
            class="color-opt${selectedColor.val === c.val ? ' picked' : ''}"
            style="background:${c.val};"
            aria-label="Select folder color">
    </button>
  `).join('');

  el.querySelectorAll('.color-opt').forEach((button, index) => {
    button.addEventListener('click', () => {
      el.querySelectorAll('.color-opt').forEach(option => option.classList.remove('picked'));
      button.classList.add('picked');
      onChange(COLOR_OPTIONS[index]);
    });
  });

  onChange(selectedColor);
}

// Saves edits from the edit-folder modal.
async function submitEditFolder(button) {
  const btn = getActionButton(button);
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
        bg: rfModalColor.bg,
      }),
    });

    const data = await res.json();

    if (data.success) {
      closeModal('editFolder');
      updateCachedFolder(id, {
        name,
        emoji,
        color: rfModalColor.val,
        bg: rfModalColor.bg,
        updated_at: data.updated_at || new Date().toISOString(),
      });
      toastMessage = 'Folder updated.';
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

// Deletes a file from whichever folder is currently open.
async function deleteFileFromCurrentFolder(fileId) {
  if (!currentFolderFilesContext) return;
  await deleteFileFromModal(
    fileId,
    currentFolderFilesContext.id,
    currentFolderFilesContext.name,
    currentFolderFilesContext.emoji
  );
}
