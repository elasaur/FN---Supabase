let allNotes = [];
let currentNoteId = null;
let notesSaving = false;

async function ensureNotesFoldersLoaded() {
  if (Array.isArray(allFolders) && allFolders.length) return allFolders;

  try {
    await loadFolders();
  } catch (err) {
    const res = await fetch('/api/folders');
    allFolders = await res.json();
  }

  return allFolders || [];
}

function sameLocalDate(dateValue, filterValue) {
  if (!filterValue) return true;
  const parsed = parseAppDate(dateValue);
  if (!parsed) return false;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}` === filterValue;
}

function noteChecklistProgress(note) {
  const checklist = Array.isArray(note?.checklist) ? note.checklist : [];
  const total = checklist.length;
  const done = checklist.filter(item => item.done).length;
  return { done, total, label: `${done}/${total} done` };
}

function noteDateLabel(note) {
  const modified = note?.updated_at ? timeAgo(note.updated_at) : 'Just now';
  const created = note?.created_at ? timeAgo(note.created_at) : 'Just now';
  return `Modified ${modified} - Created ${created}`;
}

function noteFolderLabel(note) {
  return note?.folder_name || 'No folder tag';
}

function noteTagPalette(note) {
  if (note?.folder_id) {
    return {
      color: note.folder_color || 'var(--accent)',
      bg: note.folder_bg || 'var(--accent3)',
    };
  }

  return {
    color: '#b09e94',
    bg: '#f7f4f0',
  };
}

function folderPaletteById(folderId) {
  const folder = (allFolders || []).find(item => String(item.id) === String(folderId));
  return folder
    ? { color: folder.color || 'var(--accent)', bg: folder.bg || 'var(--accent3)' }
    : noteTagPalette(null);
}

function renderNotesFolderOptions() {
  const filter = document.getElementById('notesFolderFilter');
  const editorSelect = document.getElementById('noteFolderSelect');
  const moveSelect = document.getElementById('moveNoteFolder');
  const tagOptions = (allFolders || []).map(folder => (
    `<option value="${folder.id}">${escHtml(folder.name)}</option>`
  )).join('');

  if (filter) {
    const current = filter.value;
    filter.innerHTML = `<option value="">All tags</option><option value="__untagged">No folder tag</option>${tagOptions}`;
    filter.value = current;
  }

  if (editorSelect) {
    const selected = editorSelect.value;
    editorSelect.innerHTML = `<option value="">No folder tag</option>${tagOptions}`;
    editorSelect.value = selected;
  }

  if (moveSelect) {
    const selected = moveSelect.value;
    moveSelect.innerHTML = `<option value="">No folder tag</option>${tagOptions}`;
    moveSelect.value = selected;
  }
}

async function loadNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;

  await ensureNotesFoldersLoaded();
  renderNotesFolderOptions();

  const search = document.getElementById('notesSearch')?.value || '';
  const folderId = document.getElementById('notesFolderFilter')?.value || '';
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  if (folderId && folderId !== '__untagged') query.set('folder_id', folderId);

  list.innerHTML = '<div class="notes-loading"><span class="spinner"></span></div>';

  try {
    const res = await fetch(`/api/notes${query.toString() ? `?${query.toString()}` : ''}`);
    allNotes = await res.json();
    renderNotesList();
  } catch (err) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">!</div><div class="es-text">Could not load notes.</div></div>';
  }
}

function filteredNotes() {
  const folderFilter = document.getElementById('notesFolderFilter')?.value || '';
  const search = String(document.getElementById('notesSearch')?.value || '').trim().toLowerCase();

  const byName = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  const byTag = (a, b) => noteFolderLabel(a).localeCompare(noteFolderLabel(b), undefined, { sensitivity: 'base' }) || byName(a, b);
  const byCreatedAsc = (a, b) => (parseAppDate(a.created_at)?.getTime() || 0) - (parseAppDate(b.created_at)?.getTime() || 0);
  const byCreatedDesc = (a, b) => (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0);
  const byModified = (a, b) => (parseAppDate(b.updated_at)?.getTime() || 0) - (parseAppDate(a.updated_at)?.getTime() || 0);

  const sorted = [...(allNotes || [])]
    .filter(note => {
      if (folderFilter === '__untagged') return !note.folder_id;
      return !folderFilter || String(note.folder_id) === String(folderFilter);
    })
    .filter(note => (
      !search
      || String(note.title || '').toLowerCase().includes(search)
      || String(note.body || '').toLowerCase().includes(search)
    ));

  if (notesSortMode === 'tag') sorted.sort(byTag);
  else if (notesSortMode === 'created_asc') sorted.sort((a, b) => byCreatedAsc(a, b) || byName(a, b));
  else if (notesSortMode === 'created_desc') sorted.sort((a, b) => byCreatedDesc(a, b) || byName(a, b));
  else if (notesSortMode === 'modified') sorted.sort((a, b) => byModified(a, b) || byName(a, b));
  else sorted.sort(byName);

  return sorted;
}

function setNotesSort(mode, el) {
  notesSortMode = mode;
  document.querySelectorAll('#page-notes .sort-chip').forEach(chip => {
    chip.classList.toggle('active', chip === el || chip.dataset.sort === mode);
  });
  renderNotesList();
}

function renderNotesList() {
  const list = document.getElementById('notesList');
  if (!list) return;

  const notes = filteredNotes();
  document.querySelectorAll('#page-notes .sort-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sort === notesSortMode);
  });

  if (!notes.length) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-icon"><span class="material-symbols-rounded">edit_note</span></div>
        <div class="es-text">No notes found.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = notes.map(note => noteCardHtml(note)).join('');
}

function noteCardHtml(note) {
  const progress = noteChecklistProgress(note);
  const hasFolder = Boolean(note.folder_id);
  const palette = noteTagPalette(note);
  const body = String(note.body || '').trim() || 'No body text yet.';
  const folderText = hasFolder ? note.folder_name : 'No folder tag';
  const folderIcon = hasFolder
    ? folderIconHtml(note.folder_emoji, 'note-folder-icon')
    : '<span class="material-symbols-rounded note-folder-icon">label_off</span>';

  return `
    <div class="note-card ${Number(note.id) === Number(currentNoteId) ? 'active' : ''}" style="--note-color:${escHtml(palette.color)};" onclick="openNote(${note.id})">
      <div class="note-card-menu-wrap" onclick="event.stopPropagation()">
        <button class="folder-menu-btn"
          onclick="showFloatingNoteMenu(event, this)"
          data-note-id="${note.id}"
          data-folder-id="${hasFolder ? note.folder_id : ''}"
          title="Options">
          <span aria-hidden="true">&#8942;</span>
        </button>
      </div>
      <div class="note-card-title">${escHtml(note.title || 'Untitled Note')}</div>
      <div class="note-card-body">${escHtml(body)}</div>
      <div class="note-card-meta">${escHtml(noteDateLabel(note))}</div>
      <div class="note-card-bottom">
        <span class="note-folder-pill ${hasFolder ? '' : 'untagged'}" style="background:${escHtml(palette.bg)};color:${escHtml(palette.color)};">
          ${folderIcon}
          ${escHtml(folderText)}
        </span>
        <span class="note-progress-pill">${progress.done}/${progress.total} task${progress.total === 1 ? '' : 's'}</span>
      </div>
    </div>
  `;
}

async function createNewNote() {
  await ensureNotesFoldersLoaded();
  const folderFilter = document.getElementById('notesFolderFilter')?.value || '';
  currentNoteId = null;
  renderNoteEditor({
    id: null,
    title: '',
    body: '',
    folder_id: folderFilter === '__untagged' ? '' : folderFilter,
    checklist: []
  });
  openModal('noteEditor');
}

async function openNote(noteId) {
  try {
    const res = await fetch(`/api/notes/${noteId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Note not found.');

    currentNoteId = data.note.id;
    upsertLocalNote(data.note);
    renderNotesList();
    renderNoteEditor(data.note);
    openModal('noteEditor');
  } catch (err) {
    showToast?.(err.message || 'Could not open note.', 'error');
  }
}

function renderNoteEditor(note) {
  const editor = document.getElementById('noteEditorModalContent');
  if (!editor) return;

  const checklist = Array.isArray(note.checklist) ? note.checklist : [];
  const progress = noteChecklistProgress(note);
  const palette = noteTagPalette(note);

  editor.innerHTML = `
    <div class="note-editor-shell" id="noteEditorShell" style="--note-color:${escHtml(palette.color)};--note-bg:${escHtml(palette.bg)};">
      <div class="note-editor-accent"></div>

      <div class="notes-editor-top">
        <div class="note-modal-title">
          <span class="material-symbols-rounded">sticky_note_2</span>
          <span>${note.id ? 'Note' : 'New Note'}</span>
        </div>
        <div class="notes-save-status" id="notesSaveStatus">${note.id ? 'Saved' : 'Not saved yet'}</div>
      </div>

      <div class="note-paper-fields">
        <input class="note-title-input" id="noteTitleInput" value="${escHtml(note.title || '')}" placeholder="Title" />
        <textarea class="note-body-input" id="noteBodyInput" placeholder="Body">${escHtml(note.body || '')}</textarea>
      </div>

      <div class="note-tag-row">
        <label class="note-field-label" for="noteFolderSelect">Folder tag</label>
        <select class="note-folder-select" id="noteFolderSelect" onchange="syncNoteEditorAccent()"></select>
      </div>

      <div class="checklist-head">
        <div>
          <div class="checklist-title">Checklist</div>
          <div class="checklist-progress">${progress.done}/${progress.total} task${progress.total === 1 ? '' : 's'} done</div>
        </div>
        <button class="btn btn-ghost" onclick="addChecklistItem()">
          <span class="material-symbols-rounded">add_task</span>
          Add Task
        </button>
      </div>

      <div id="checklistRows">
        ${checklist.map((item, index) => checklistRowHtml(item, index)).join('')}
      </div>

      <div class="notes-editor-actions">
        <button class="btn btn-ghost" onclick="closeNoteEditor()">
          <span class="material-symbols-rounded">close</span>
          Close
        </button>
        <button class="btn btn-primary" onclick="saveCurrentNoteNow()">
          <span class="material-symbols-rounded">save</span>
          Save
        </button>
      </div>
    </div>
  `;

  renderNotesFolderOptions();
  const folderSelect = document.getElementById('noteFolderSelect');
  if (folderSelect) {
    const filterValue = document.getElementById('notesFolderFilter')?.value || '';
    folderSelect.value = note.folder_id || (filterValue === '__untagged' ? '' : filterValue);
    syncNoteEditorAccent();
  }
}

function syncNoteEditorAccent() {
  const shell = document.getElementById('noteEditorShell');
  if (!shell) return;

  const folderValue = document.getElementById('noteFolderSelect')?.value || '';
  const palette = folderPaletteById(folderValue);
  shell.style.setProperty('--note-color', palette.color);
  shell.style.setProperty('--note-bg', palette.bg);
}

function checklistRowHtml(item, index) {
  return `
    <div class="checklist-row" data-index="${index}">
      <input type="checkbox" ${item.done ? 'checked' : ''} onchange="updateEditorProgress()" />
      <input class="checklist-input" value="${escHtml(item.text || '')}" placeholder="Checklist item" oninput="updateEditorProgress()" />
      <button class="checklist-remove" onclick="removeChecklistItem(${index})" title="Remove task">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
}

function readEditorChecklist() {
  return [...document.querySelectorAll('#checklistRows .checklist-row')]
    .map(row => ({
      text: row.querySelector('.checklist-input')?.value.trim() || '',
      done: Boolean(row.querySelector('input[type="checkbox"]')?.checked),
    }))
    .filter(item => item.text);
}

function readEditorPayload() {
  const title = document.getElementById('noteTitleInput')?.value.trim() || 'Untitled Note';
  const folderValue = document.getElementById('noteFolderSelect')?.value || '';
  return {
    title,
    body: document.getElementById('noteBodyInput')?.value || '',
    folder_id: folderValue ? Number(folderValue) : null,
    checklist: readEditorChecklist(),
  };
}

function updateEditorProgress() {
  const items = readEditorChecklist();
  const done = items.filter(item => item.done).length;
  const total = items.length;
  const progress = document.querySelector('.checklist-progress');
  if (progress) progress.textContent = `${done}/${total} task${total === 1 ? '' : 's'} done`;
}

async function saveCurrentNoteNow() {
  if (notesSaving) return;

  const payload = readEditorPayload();
  const isNew = !currentNoteId;
  const url = isNew ? '/api/notes' : `/api/notes/${currentNoteId}`;
  const method = isNew ? 'POST' : 'PUT';
  notesSaving = true;
  setNotesSaveStatus('Saving...');

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not save note.');

    currentNoteId = data.note.id;
    upsertLocalNote(data.note);
    renderNotesList();
    renderNoteEditor(data.note);
    setNotesSaveStatus('Saved');
    showToast?.(isNew ? 'Note created.' : 'Note saved.', 'success');
    if (currentFolderFilesContext) {
      await loadCurrentFolderNotes(currentFolderFilesContext.id);
      renderCurrentFolderFilesFromCache();
    }
  } catch (err) {
    setNotesSaveStatus('Could not save');
    showToast?.(err.message || 'Could not save note.', 'error');
  } finally {
    notesSaving = false;
  }
}

function upsertLocalNote(note) {
  allNotes = [
    note,
    ...(allNotes || []).filter(item => Number(item.id) !== Number(note.id))
  ];
}

function addChecklistItem() {
  const rows = document.getElementById('checklistRows');
  if (!rows) return;

  const index = rows.querySelectorAll('.checklist-row').length;
  rows.insertAdjacentHTML('beforeend', checklistRowHtml({ text: '', done: false }, index));
  rows.querySelector('.checklist-row:last-child .checklist-input')?.focus();
  updateEditorProgress();
}

function removeChecklistItem(index) {
  const rows = document.getElementById('checklistRows');
  if (!rows) return;

  rows.querySelector(`.checklist-row[data-index="${index}"]`)?.remove();
  [...rows.querySelectorAll('.checklist-row')].forEach((row, nextIndex) => {
    row.dataset.index = nextIndex;
    row.querySelector('.checklist-remove')?.setAttribute('onclick', `removeChecklistItem(${nextIndex})`);
  });
  updateEditorProgress();
}

function closeNoteEditor() {
  currentNoteId = null;
  closeModal('noteEditor');
  renderNotesList();
}

function setNotesSaveStatus(text) {
  const status = document.getElementById('notesSaveStatus');
  if (status) status.textContent = text;
}

function showFloatingNoteMenu(e, button) {
  e.stopPropagation();
  const noteId = Number(button.dataset.noteId);
  closeNoteMenus();

  let menu = document.getElementById('floating-note-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'floating-note-menu';
    menu.className = 'folder-menu-dropdown open';
    document.body.appendChild(menu);
  }

  menu.innerHTML = `
    <button onclick="openMoveNoteModal(${noteId});closeNoteMenus()"><img class="ui-icon ui-icon-sm" src="${localIcon('icons8-move-50.png')}" alt=""> Move</button>
    <button class="danger" onclick="deleteNoteById(${noteId});closeNoteMenus()"><img class="ui-icon ui-icon-sm" src="${localIcon('icons8-delete-file-50.png')}" alt=""> Delete</button>
  `;

  const rect = button.getBoundingClientRect();
  menu.style.width = '168px';
  menu.style.position = 'absolute';
  menu.style.left = (rect.left + window.scrollX - 146) + 'px';
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  menu.style.zIndex = 99999;
  menu.style.display = 'block';
}

function closeNoteMenus() {
  document.getElementById('floating-note-menu')?.remove();
}

document.addEventListener('click', function(e) {
  const menu = document.getElementById('floating-note-menu');
  if (menu && !menu.contains(e.target)) closeNoteMenus();
});

async function openMoveNoteModal(noteId) {
  noteToMoveId = noteId;
  await ensureNotesFoldersLoaded();
  renderNotesFolderOptions();
  const note = [...(allNotes || []), ...(currentFolderNotes || [])].find(item => Number(item.id) === Number(noteId));
  const select = document.getElementById('moveNoteFolder');
  if (select) select.value = note?.folder_id || '';
  openModal('moveNote');
}

async function submitMoveNote() {
  if (!noteToMoveId) return;
  const folderValue = document.getElementById('moveNoteFolder')?.value || '';

  try {
    const res = await fetch(`/api/notes/${noteToMoveId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderValue ? Number(folderValue) : null }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not move note.');

    upsertLocalNote(data.note);
    renderNotesList();
    if (currentFolderFilesContext) {
      await loadCurrentFolderNotes(currentFolderFilesContext.id);
      renderCurrentFolderFilesFromCache();
    }
    closeModal('moveNote');
    showToast?.(data.note.folder_id ? 'Note moved.' : 'Folder tag removed.', 'success');
  } catch (err) {
    showToast?.(err.message || 'Could not move note.', 'error');
  }
}

async function deleteNoteById(noteId) {
  if (!confirm('Delete this note permanently?')) return;

  try {
    const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not delete note.');

    allNotes = (allNotes || []).filter(note => Number(note.id) !== Number(noteId));
    currentFolderNotes = (currentFolderNotes || []).filter(note => Number(note.id) !== Number(noteId));
    if (Number(currentNoteId) === Number(noteId)) closeNoteEditor();
    renderNotesList();
    renderCurrentFolderFilesFromCache();
    showToast?.('Note deleted.', 'warn');
  } catch (err) {
    showToast?.(err.message || 'Could not delete note.', 'error');
  }
}
