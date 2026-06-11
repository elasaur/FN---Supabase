// Upload analysis feature: validate files, call AI analysis, and show suggestions.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'xlsx', 'xls',
  'pptx', 'ppt', 'txt',
  'jpg', 'jpeg', 'png',
  'mp3', 'mp4',
  'zip', 'csv',
]);
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

function validateUploadExtension(file) {
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  if (file?.name?.includes('.') && ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return true;
  showToast('File type not supported.', 'error');
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
  if (!validateUploadExtension(file)) return;
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
    // The backend always returns the engine used for this analysis.
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
        engineLabel.style.color = 'var(--sky)';
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
    if (!el) return;
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

// Confirm upload feature: resolve the target folder and persist the file.
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

  let toastMessage = '';
  let toastType = 'success';

  try {
    const chosenFolder = selectedFolderObj;
    const chosenName = chosenFolder ? (chosenFolder.folder || chosenFolder.name || '') : '';
    const existingFolder = chosenName
      ? allFolders.find(f => String(f.name || '').toLowerCase() === chosenName.toLowerCase())
      : null;
    const defaultFolder = allFolders.find(f => f.is_default);
    const targetFolderId = chosenFolder?._db_id || existingFolder?.id || (!chosenName ? defaultFolder?.id : null);

    if (!targetFolderId && !chosenName) {
      toastType = 'warn';
      toastMessage = 'Please select a folder.';
      return;
    }
    if (!chosenName && defaultFolder) {
      toastType = 'warn';
      toastMessage = 'No folder selected. Saved to Important Folder.';
    }

    const formData = new FormData();
    formData.append('file', currentFile);
    if (targetFolderId) {
      formData.append('folder_id', targetFolderId);
    } else {
      formData.append('folder_name', chosenName);
      formData.append('folder_emoji', chosenFolder?.emoji || 'folder');
      formData.append('folder_color', chosenFolder?.color || '#7ec8e3');
      formData.append('folder_bg',    chosenFolder?.bg    || '#e0f4fb');
    }
    formData.append('ai_sorted', chosenFolder && !chosenFolder._db_id ? '1' : '0');
    formData.append('keywords', (currentAnalysis?.keywords || []).join(','));

    const res = await fetch('/api/confirm-upload', { method: 'POST', body: formData });
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
    const savedFolder = data.folder || getCachedFolder(targetFolderId);
    if (savedFolder && !getCachedFolder(savedFolder.id)) allFolders.push(savedFolder);
    const savedFolderName = savedFolder?.name || chosenName || 'Important Folder';
    showToast(`"${data.file?.original_name || 'File'}" saved to ${savedFolderName}.`, 'success');

    currentFile = null; currentAnalysis = null; selectedFolderObj = null;
    document.getElementById('fileInput').value = '';
    addCachedFile(data.file, savedFolder?.id || targetFolderId);
    syncCachesSilently();
    toastMessage = '';
    return;

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

// Upload file list feature: render, sort, and delete uploaded files.
async function loadUploadFileList(sortMode) {
  if (sortMode) uploadSortMode = sortMode;
  const list    = document.getElementById('fileList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';
  const res = await fetch(`/api/files?sort=${uploadSortMode}&recent_minutes=5&t=${Date.now()}`);
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
  const files = filterRecentUploadFiles(uploadFiles);
  const countEl = document.getElementById('filesCount');
  if (countEl) countEl.textContent = files.length;
  if (!files.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon">${filledSvgIcon('file.svg', 'empty-svg-icon')}</div><div class="es-text">No uploads from the last 5 minutes.</div></div>`;
    return;
  }
  list.innerHTML = files.map((f, idx) => `
    <div class="file-item file-folder-link upload-file-card" role="button" tabindex="0" onclick="openFileFolder(${f.id})" onkeydown="handleFileFolderKeydown(event, ${f.id})" style="animation-delay:${idx*0.04}s;">
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
  deleteFileById(id);
}
