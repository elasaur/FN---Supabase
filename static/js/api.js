// static/js/api.js

async function apiGet(url) {
  const res = await fetch(url);
  return await res.json();
}

async function apiPost(url, body, isFormData = false) {
  const options = { method: 'POST' };

  if (isFormData) {
    options.body = body;
  } else {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  return await res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return await res.json();
}

function sameId(a, b) {
  return Number(a) === Number(b);
}

function getCachedFile(fileId) {
  return [...allFiles, ...uploadFiles, ...dashRecentFiles]
    .find(file => sameId(file.id, fileId)) || null;
}

function getCachedFolder(folderId) {
  return allFolders.find(folder => sameId(folder.id, folderId)) || null;
}

function openFileFolder(fileId) {
  const file = getCachedFile(fileId);
  if (!file) return;
  openFolderFiles(
    file.folder_id,
    file.folder_name || 'Folder',
    file.folder_emoji || 'folder'
  );
}

function handleFileFolderKeydown(event, fileId) {
  if (event.target.closest('button, a, input, select, textarea')) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openFileFolder(fileId);
}

function filterRecentUploadFiles(files, minutes = 5) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return (Array.isArray(files) ? files : []).filter(file => {
    const created = parseAppDate(file.created_at)?.getTime();
    return created && created >= cutoff;
  });
}

function currentStatsFromCache() {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const storageUsedBytes = allFiles.reduce((sum, file) => sum + Number(file.file_size || 0), 0);
  return {
    total_folders: allFolders.length,
    total_files: allFiles.length,
    recent_count: allFiles.filter(file => {
      const created = parseAppDate(file.created_at)?.getTime();
      return created && now - created <= weekMs;
    }).length,
    ai_suggestions_accepted: allFiles.filter(file => Number(file.ai_sorted) === 1 || file.ai_sorted === true).length,
    storage_limit_bytes: typeof STORAGE_LIMIT_BYTES === 'number' ? STORAGE_LIMIT_BYTES : 5 * 1024 * 1024 * 1024,
    storage_used_bytes: storageUsedBytes,
    storage_remaining_bytes: Math.max((typeof STORAGE_LIMIT_BYTES === 'number' ? STORAGE_LIMIT_BYTES : 5 * 1024 * 1024 * 1024) - storageUsedBytes, 0),
  };
}

function refreshFolderCountsFromCache() {
  allFolders.forEach(folder => {
    folder.file_count = allFiles.filter(file => sameId(file.folder_id, folder.id)).length;
  });
}

function chartDataFromCache() {
  refreshFolderCountsFromCache();
  return allFolders
    .map(folder => ({
      name: folder.name,
      emoji: folder.emoji,
      color: folder.color,
      count: Number(folder.file_count || 0),
    }))
    .sort((a, b) => b.count - a.count);
}

function renderDashboardFromCache() {
  const stats = currentStatsFromCache();
  const totalFolders = document.getElementById('dashTotalFolders');
  const totalFiles = document.getElementById('dashTotalFiles');
  const recentCount = document.getElementById('dashRecentCount');
  const aiAccepted = document.getElementById('dashAiAccepted');

  if (totalFolders) totalFolders.textContent = stats.total_folders;
  if (totalFiles) totalFiles.textContent = stats.total_files;
  if (recentCount) recentCount.textContent = stats.recent_count;
  if (aiAccepted) aiAccepted.textContent = `${stats.ai_suggestions_accepted} / ${stats.total_files}`;

  if (typeof renderDashboardPinnedFoldersFromCache === 'function') renderDashboardPinnedFoldersFromCache();
  if (typeof renderDashboardRecentUploads === 'function') renderDashboardRecentUploads();
}

function renderStatsFromCache() {
  const stats = currentStatsFromCache();
  if (typeof renderAiSortingSummary === 'function') renderAiSortingSummary(stats);
  if (typeof renderStorageUsage === 'function') renderStorageUsage(stats);
  if (typeof renderFolderBars === 'function') renderFolderBars(chartDataFromCache());
  if (typeof renderTypeDonut === 'function') renderTypeDonut(allFiles);
}

function renderEverywhereFromCache() {
  refreshFolderCountsFromCache();
  if (typeof sortAllFilesCache === 'function') sortAllFilesCache();
  if (typeof sortUploadFilesCache === 'function') sortUploadFilesCache();
  if (typeof renderAllFilesTable === 'function') renderAllFilesTable();
  if (typeof renderUploadFileList === 'function') renderUploadFileList();
  if (typeof renderFolderGrid === 'function') renderFolderGrid();
  if (typeof renderCurrentFolderFilesFromCache === 'function') renderCurrentFolderFilesFromCache();
  renderDashboardFromCache();
  renderStatsFromCache();
}

function updateCachedFile(fileId, updater) {
  [allFiles, uploadFiles, dashRecentFiles].forEach(list => {
    list.forEach(file => {
      if (sameId(file.id, fileId)) updater(file);
    });
  });
}

function removeCachedFile(fileId) {
  allFiles = allFiles.filter(file => !sameId(file.id, fileId));
  uploadFiles = uploadFiles.filter(file => !sameId(file.id, fileId));
  dashRecentFiles = dashRecentFiles.filter(file => !sameId(file.id, fileId));
  renderEverywhereFromCache();
}

function renameCachedFile(fileId, name) {
  updateCachedFile(fileId, file => {
    file.original_name = name;
    file.extension = getExt(name);
  });
  renderEverywhereFromCache();
}

function moveCachedFile(fileId, folderId) {
  const folder = getCachedFolder(folderId);
  updateCachedFile(fileId, file => {
    file.folder_id = Number(folderId);
    if (folder) {
      file.folder_name = folder.name;
      file.folder_emoji = folder.emoji;
      file.folder_color = folder.color;
      file.folder_bg = folder.bg;
    }
  });
  renderEverywhereFromCache();
}

function addCachedFile(file, folderId) {
  if (!file) return;
  const folder = getCachedFolder(folderId || file.folder_id);
  const cached = { ...file };
  if (folder) {
    cached.folder_id = Number(folder.id);
    cached.folder_name = folder.name;
    cached.folder_emoji = folder.emoji;
    cached.folder_color = folder.color;
    cached.folder_bg = folder.bg;
  }

  allFiles = [cached, ...allFiles.filter(item => !sameId(item.id, cached.id))];
  uploadFiles = [cached, ...uploadFiles.filter(item => !sameId(item.id, cached.id))];
  dashRecentFiles = [cached, ...dashRecentFiles.filter(item => !sameId(item.id, cached.id))];
  allFilesLoaded = true;
  renderEverywhereFromCache();
}

function updateCachedFolder(folderId, changes) {
  const folder = getCachedFolder(folderId);
  if (folder) Object.assign(folder, changes);

  [allFiles, uploadFiles, dashRecentFiles].forEach(list => {
    list.forEach(file => {
      if (sameId(file.folder_id, folderId)) {
        if (Object.hasOwn(changes, 'name')) file.folder_name = changes.name;
        if (Object.hasOwn(changes, 'emoji')) file.folder_emoji = changes.emoji;
        if (Object.hasOwn(changes, 'color')) file.folder_color = changes.color;
        if (Object.hasOwn(changes, 'bg')) file.folder_bg = changes.bg;
      }
    });
  });

  if (currentFolderFilesContext && sameId(currentFolderFilesContext.id, folderId)) {
    if (Object.hasOwn(changes, 'name')) currentFolderFilesContext.name = changes.name;
    if (Object.hasOwn(changes, 'emoji')) currentFolderFilesContext.emoji = changes.emoji;
    const title = document.getElementById('folderFilesTitle');
    if (title) {
      title.innerHTML = `${folderIconHtml(currentFolderFilesContext.emoji, 'modal-title-icon')} ${escHtml(currentFolderFilesContext.name)}`;
    }
  }

  renderEverywhereFromCache();
}

function removeCachedFolder(folderId) {
  allFolders = allFolders.filter(folder => !sameId(folder.id, folderId));
  allFiles = allFiles.filter(file => !sameId(file.folder_id, folderId));
  uploadFiles = uploadFiles.filter(file => !sameId(file.folder_id, folderId));
  dashRecentFiles = dashRecentFiles.filter(file => !sameId(file.folder_id, folderId));

  if (currentFolderFilesContext && sameId(currentFolderFilesContext.id, folderId)) {
    currentFolderFilesContext = null;
    navigate?.('folders', document.getElementById('nav-folders'));
  }

  renderEverywhereFromCache();
}

function clearCachedFiles() {
  allFiles = [];
  uploadFiles = [];
  dashRecentFiles = [];
  renderEverywhereFromCache();
}

function removeCachedNonDefaultFolders() {
  const deletedIds = new Set(allFolders.filter(folder => !folder.is_default).map(folder => Number(folder.id)));
  allFolders = allFolders.filter(folder => folder.is_default);
  allFiles = allFiles.filter(file => !deletedIds.has(Number(file.folder_id)));
  uploadFiles = uploadFiles.filter(file => !deletedIds.has(Number(file.folder_id)));
  dashRecentFiles = dashRecentFiles.filter(file => !deletedIds.has(Number(file.folder_id)));

  if (currentFolderFilesContext && deletedIds.has(Number(currentFolderFilesContext.id))) {
    currentFolderFilesContext = null;
    navigate?.('folders', document.getElementById('nav-folders'));
  }

  renderEverywhereFromCache();
}

function syncCachesSilently() {
  Promise.all([
    fetch('/api/folders').then(res => res.json()),
    fetch('/api/files?sort=date').then(res => res.json()),
  ]).then(([folders, files]) => {
    allFolders = folders;
    allFiles = files;
    uploadFiles = filterRecentUploadFiles(files);
    dashRecentFiles = [...files];
    allFilesLoaded = true;
    renderEverywhereFromCache();
  }).catch(() => {});
}
