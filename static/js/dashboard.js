// static/js/dashboard.js

async function loadDashboard() {
  updateDashboardGreeting();
  setDashboardLoading();
  const [data, folders, files] = await Promise.all([
    apiGet('/api/stats'),
    apiGet('/api/folders'),
    apiGet('/api/files?sort=date'),
  ]);

  document.getElementById('dashTotalFolders').textContent = data.total_folders;
  document.getElementById('dashTotalFiles').textContent = data.total_files;
  document.getElementById('dashRecentCount').textContent = data.recent_count;
  document.getElementById('dashAiAccepted').textContent = `${data.ai_suggestions_accepted} / ${data.total_files}`;

  allFolders = folders;
  allFiles = files;
  uploadFiles = files;
  allFilesLoaded = true;

  const pinned = allFolders.filter(f => f.pinned);
  const pinnedEl = document.getElementById('dashPinnedFolders');
  pinnedEl.innerHTML = pinned.length
    ? pinned.map(f => makeFolderCard(f, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;padding:20px;">
    <div class="es-icon">${svgIcon('pin-folder.svg', 'empty-svg-icon')}</div>
    <div class="es-text">
        No pinned folders yet - pin one from the Folders page!
    </div>
</div>`;

  dashRecentFiles = files;
  renderDashboardRecentUploads();
}

function displayGivenNames(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts[0] || 'there';
  return parts.slice(0, 2).join(' ');
}

function philippineGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Asia/Manila',
  }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function updateDashboardGreeting(name) {
  const greetText = document.getElementById('greetText');
  const greetName = document.getElementById('greetName');
  if (greetText) greetText.textContent = philippineGreeting();
  if (greetName) greetName.textContent = displayGivenNames(name || window.FILE_NEST_USER?.name || greetName.textContent);
}

function setDashboardRecentSort(mode, el) {
  dashRecentSortMode = mode;
  document.querySelectorAll('.dashboard-recent-sort .dashboard-recent-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderDashboardRecentUploads();
}

function renderDashboardRecentUploads() {
  const recEl = document.getElementById('dashRecentList');
  if (!recEl) return;
  const sorted = [...dashRecentFiles];
  if (dashRecentSortMode === 'name') sorted.sort((a,b) => a.original_name.localeCompare(b.original_name));
  if (dashRecentSortMode === 'folder') sorted.sort((a,b) => String(a.folder_name || '').localeCompare(String(b.folder_name || '')));
  if (dashRecentSortMode === 'type') sorted.sort((a,b) => getExt(a.original_name).localeCompare(getExt(b.original_name)));
  if (dashRecentSortMode === 'date') sorted.sort((a,b) => (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0));
  recEl.innerHTML = sorted.length
    ? sorted.slice(0,5).map(f => makeRecentItem(f)).join('')
    : `<div class="empty-state">
      <div class="es-icon">${svgIcon('file.svg', 'empty-svg-icon')}</div>
      <div class="es-text">
          No files yet - upload one to get started!
      </div>
  </div>`;
  }

function makeRecentItem(f) {
  return `
    <div class="recent-item">
      <div class="recent-file-icon">${getExtIcon(f.original_name)}</div>
      <div class="recent-meta">
        <div class="recent-name">${escHtml(f.original_name)}${newFileBadge(f.created_at)}</div>
        <div class="recent-info">
          <span class="fi-folder" style="background:${f.folder_bg};color:${f.folder_color};">${folderIconHtml(f.folder_emoji, 'recent-folder-icon')} ${escHtml(f.folder_name)}</span>
          <span>${getExt(f.original_name).toUpperCase() || 'FILE'}</span>
          <span>${formatSize(f.file_size)}</span>
        </div>
      </div>
      <div class="recent-date">${timeAgo(f.created_at)}</div>
      ${fileActionsButton(f.id, f.folder_id, f.original_name, `deleteFileDashboard(${f.id})`)}
    </div>`;
}

async function deleteFileDashboard(id) {
  deleteFileById(id);
}

function setDashboardLoading() {
  ['dashTotalFolders', 'dashTotalFiles', 'dashRecentCount', 'dashAiAccepted'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="spinner"></span>';
  });
  const pinnedEl = document.getElementById('dashPinnedFolders');
  if (pinnedEl) pinnedEl.innerHTML = '<div class="section-loading"><div class="spinner"></div></div>';
  const recEl = document.getElementById('dashRecentList');
  if (recEl) recEl.innerHTML = '<div class="section-loading"><div class="spinner"></div></div>';
}
