// ── Upload / Analyze ───────────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
let activeAnalyzeRequestId = 0;
let activeAnalyzeController = null;
let uploadSaveInFlight = false;

function clearPendingUploadState() {
  activeAnalyzeRequestId += 1;
  currentFile = null;
  currentAnalysis = null;
  selectedFolderObj = null;
  activeAnalyzeController?.abort();
  activeAnalyzeController = null;
  document.getElementById('predictionCard')?.classList.remove('show', 'saving');
  resetUploadZone();
  const input = document.getElementById('fileInput');
  if (input) input.value = '';
}

function validateUploadSize(file) {
  if (!file || file.size <= MAX_UPLOAD_BYTES) return true;
  showToast(`File exceeded the maximum upload size of ${MAX_UPLOAD_MB} MB.`, 'error');
  clearPendingUploadState();
  return false;
}

function onDragOver(e)  { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); }
function onDragLeave(e) { document.getElementById('uploadZone').classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
}

async function handleFiles(files) {
  if (!files || !files.length) return;

  const file = files[0];
  if (!validateUploadSize(file)) return;
  activeAnalyzeController?.abort();
  activeAnalyzeController = new AbortController();
  const requestId = ++activeAnalyzeRequestId;
  currentFile = file;
  currentAnalysis = null;
  selectedFolderObj = null;

  showUploadLoading('Analyzing your file...', 'Reading the file and preparing folder suggestions.');
  document.getElementById('uploadZoneTitle').textContent =
    `Analyzing "${file.name}"…`;

  document.getElementById('predictionCard').classList.remove('show');

  const formData = new FormData();
  formData.append('file', file);

  try {
    setTimeout(() => setUploadStep(3), 1800);

    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
      signal: activeAnalyzeController.signal,
    });

    const data = await res.json().catch(() => ({
      success: false,
      message: res.status === 413
        ? `File exceeded the maximum upload size of ${MAX_UPLOAD_MB} MB.`
        : (res.status === 429 ? 'Too many requests. Try again later.' : 'Analysis failed. Please try again.'),
    }));

    if (requestId !== activeAnalyzeRequestId) return;

    if (!data.success) {
      clearPendingUploadState();
      showToast(data.message, 'error');
      return;
    }

    currentAnalysis = data.analysis;

    // ✅ SAFE: now always exists
    const engine = data.analysis.ai_status;

    const engineLabel = document.getElementById('predEngineLabel');
    const engineTag = document.getElementById('predEngineTag');

    if (engine === 'textblob') {
      if (engineTag) {
        engineTag.textContent = 'TextBlob';
        engineTag.classList.add('textblob');
      }
      if (engineLabel) {
        engineLabel.textContent =
          'Analyzed by TextBlob - Review and confirm below';
        engineLabel.style.color = '#a07b10';
      }
      showToast('Gemini API limit reached — using TextBlob instead', 'warn');
    } else {
      if (engineTag) {
        engineTag.textContent = 'Gemini';
        engineTag.classList.remove('textblob');
      }
      if (engineLabel) {
        engineLabel.textContent =
          'Analyzed by Gemini 2.5 Flash · Review and confirm below';
        engineLabel.style.color = '';
      }
    }

    resetUploadZone();
    showPredictionCard(file, data.analysis);

  } catch (err) {
    if (err.name === 'AbortError' || requestId !== activeAnalyzeRequestId) return;
    clearPendingUploadState();
    resetUploadZone();
    showToast('Analysis failed. Please try again.', 'error');
  } finally {
    if (requestId === activeAnalyzeRequestId) {
      activeAnalyzeController = null;
      resetUploadZone();
    }
  }
}

function showUploadLoading(title, subtitle) {
  setUploadLoadingText(title, subtitle);
  document.getElementById('uploadDefault').style.display = 'none';
  document.getElementById('uploadLoading').style.display = 'flex';
  setUploadStep(1);
  setTimeout(() => setUploadStep(2), 600);
}

function setUploadLoadingText(title, subtitle) {
  const titleEl = document.querySelector('#uploadLoading .upload-loading-title');
  const subEl = document.querySelector('#uploadLoading .upload-loading-sub');
  if (titleEl && title) titleEl.textContent = title;
  if (subEl && subtitle) subEl.textContent = subtitle;
}

function setUploadStep(active) {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`step${n}`);
    el.classList.remove('active', 'done', 'pending');
    if (n < active)       el.classList.add('done');
    else if (n === active) el.classList.add('active');
    else                  el.classList.add('pending');
  });
}

function resetUploadZone() {
  document.getElementById('uploadLoading').style.display = 'none';
  document.getElementById('uploadDefault').style.display = 'block';
  document.getElementById('uploadZoneTitle').textContent = 'Drag & drop your file here';
}

// ── Confirm Upload ─────────────────────────────────────────────────────────────
async function confirmUpload() {
  const btn = window.event?.currentTarget;
  if (uploadSaveInFlight) return;
  if (!currentFile) { showToast('No file selected.', 'warn'); return; }
  if (!currentAnalysis) { showToast('Please analyze the file before saving.', 'warn'); return; }
  if (!validateUploadSize(currentFile)) return;
  uploadSaveInFlight = true;
  resetUploadZone();
  setButtonLoading(btn, true, 'Saving...');
  document.getElementById('predictionCard').classList.add('saving');

  let folderId = null;
  let aiSorted = false;
  let toastMessage = '';
  let toastType = 'success';

  try {
  if (selectedFolderObj) {
    const name = selectedFolderObj.folder || selectedFolderObj.name;

    // Case 1: picked from folder picker — _db_id already set
    if (selectedFolderObj._db_id) {
      folderId = selectedFolderObj._db_id;
      aiSorted = false;
    } else {
      // Case 2: check if folder already exists (case-insensitive)
      let existing = allFolders.find(f => f.name.toLowerCase() === name.toLowerCase());

      // Case 3: folder doesn't exist yet — create it automatically
      if (!existing) {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            emoji: selectedFolderObj.emoji || '📁',
            color: selectedFolderObj.color || '#7ec8e3',
            bg:    selectedFolderObj.bg    || '#e0f4fb',
          }),
        });
        const d = await res.json();
        if (d.success) {
          allFolders.push(d.folder);
          existing = d.folder;
          toastMessage = `Folder "${name}" created.`;
        } else {
          toastType = 'error';
          toastMessage = d.message || 'Could not create folder.';
          return;
        }
      }

      folderId = existing.id;
      aiSorted = true;
    }
  }

  // Last resort — use Uncategorized if nothing selected
  if (!folderId) {
    const unc = allFolders.find(f => f.is_default);
    if (unc) {
      folderId = unc.id;
      toastType = 'warn';
      toastMessage = 'No folder selected. Saved to Uncategorized.';
    } else {
      toastType = 'warn';
      toastMessage = 'Please select a folder.';
      return;
    }
  }

  const formData = new FormData();
  formData.append('file',      currentFile);
  formData.append('folder_id', folderId);
  formData.append('ai_sorted', aiSorted ? '1' : '0');
  formData.append('keywords',  (currentAnalysis?.keywords || []).join(','));

  const res  = await fetch('/api/upload', { method:'POST', body:formData });
  const data = await res.json().catch(() => ({
    success: false,
    message: res.status === 413
      ? `File exceeded the maximum upload size of ${MAX_UPLOAD_MB} MB.`
      : 'Upload failed. Please try again.',
  }));
  if (!data.success) {
    toastType = 'error';
    toastMessage = data.message;
    return;
  }

  document.getElementById('predictionCard').classList.remove('show');
  const folderName = selectedFolderObj
    ? (selectedFolderObj.folder || selectedFolderObj.name)
    : 'Uncategorized';
  showToast(`"${data.file?.original_name || 'File'}" saved to ${folderName}.`, 'success');

  currentFile = null; currentAnalysis = null; selectedFolderObj = null;
  document.getElementById('fileInput').value = '';
  addCachedFile(data.file, folderId);
  syncCachesSilently();
  toastMessage = '';
  } finally {
    uploadSaveInFlight = false;
    resetUploadZone();
    document.getElementById('predictionCard').classList.remove('saving');
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

function cancelUpload() {
  document.getElementById('predictionCard').classList.remove('show');
  currentFile = null; currentAnalysis = null; selectedFolderObj = null;
  document.getElementById('fileInput').value = '';
  showToast('Upload cancelled.', 'warn');
}

// ── Upload File List ───────────────────────────────────────────────────────────
async function loadUploadFileList(sortMode) {
  if (sortMode) uploadSortMode = sortMode;
  const list    = document.getElementById('fileList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';
  const res = await fetch(`/api/files?sort=${uploadSortMode}&t=${Date.now()}`);
  uploadFiles = await res.json();
  sortUploadFilesCache();
  renderUploadFileList();
}

function sortUploadFilesCache() {
  if (uploadSortMode === 'name') uploadFiles.sort((a,b) => String(a.original_name || '').localeCompare(String(b.original_name || ''), undefined, { sensitivity: 'base' }));
  if (uploadSortMode === 'folder') uploadFiles.sort((a,b) => String(a.folder_name || '').localeCompare(String(b.folder_name || ''), undefined, { sensitivity: 'base' }));
  if (uploadSortMode === 'type') uploadFiles.sort((a,b) => getExt(a.original_name).localeCompare(getExt(b.original_name)));
  if (uploadSortMode === 'date') uploadFiles.sort((a,b) => (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0));
}

function renderUploadFileList() {
  const list = document.getElementById('fileList');
  if (!list) return;
  const files = uploadFiles;
  const countEl = document.getElementById('filesCount');
  if (countEl) countEl.textContent = files.length;
  if (!files.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon">🪺</div><div class="es-text">No files yet — upload one above to get started!</div></div>`;
    return;
  }
  list.innerHTML = files.map((f, idx) => `
    <div class="file-item" style="animation-delay:${idx*0.04}s;">
      <div class="fi-icon">${getExtIcon(f.original_name)}</div>
      <div class="fi-info">
        <div class="fi-name">${escHtml(f.original_name)}${newFileBadge(f.created_at)}</div>
        <div class="fi-meta">
          <span class="fi-folder" style="background:${f.folder_bg};color:${f.folder_color};">${folderIconHtml(f.folder_emoji, 'file-folder-icon')} ${escHtml(f.folder_name)}</span>
          <span>${getExt(f.original_name).toUpperCase() || 'FILE'}</span>
          <span>${formatSize(f.file_size)}</span>
        </div>
      </div>
      <span class="fi-date">${timeAgo(f.created_at)}</span>
      ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileUpload(${f.id})`)}
    </div>`).join('');
}

function sortFiles(mode, el) {
  uploadSortMode = mode;
  document.querySelectorAll('.sort-chip2').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  sortUploadFilesCache();
  renderUploadFileList();
}

async function deleteFileUpload(id) {
  const btn = window.event?.currentTarget;
  let toastMessage = '';
  let toastType = 'warn';
  setButtonLoading(btn, true, 'Deleting...');
  try {
    const res  = await fetch(`/api/files/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (data.success) {
      removeCachedFile(id);
      toastMessage = 'File removed.';
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
