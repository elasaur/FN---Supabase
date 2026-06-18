// static/js/dashboard.js

async function loadDashboard() {
  updateDashboardGreeting();
  if (hasAuthenticatedAppData()) {
    renderDashboardFromCache();
    syncCachesSilently();
    return;
  }

  await fetchFreshAuthenticatedAppData();
}

function displayGivenNames(fullName) {
  return String(fullName || '').trim() || 'there';
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
  if (greetText) greetText.textContent = window.FILE_NEST_USER?.dashboardGreeting || philippineGreeting();
  if (greetName) {
    greetName.textContent = displayGivenNames(
      name || window.FILE_NEST_USER?.dashboardName || window.FILE_NEST_USER?.name || greetName.textContent
    );
  }
}

function updateDashboardRecentSortLabel() {
  const field = getSortModeField(dashRecentSortMode) === 'name' ? 'Name' : 'Date Created';
  const direction = getSortModeDirection(dashRecentSortMode) === 'asc' ? 'Ascending' : 'Descending';
  setCustomDropdownLabel('dashboardRecentSortLabel', `${field} - ${direction}`);
}

function setDashboardRecentSortField(field, option) {
  dashRecentSortMode = updateSortModeField(dashRecentSortMode, field);
  selectCustomDropdownOption(option);
  updateDashboardRecentSortLabel();
  closeCustomDropdowns();
  renderDashboardRecentUploads();
}

function setDashboardRecentSortDirection(direction, option) {
  dashRecentSortMode = updateSortModeDirection(dashRecentSortMode, direction);
  selectCustomDropdownOption(option);
  updateDashboardRecentSortLabel();
  closeCustomDropdowns();
  renderDashboardRecentUploads();
}

function setDashboardRecentTypeFilter(type, option) {
  dashRecentTypeFilter = type;
  selectCustomDropdownOption(option);
  if (option) setCustomDropdownLabel('dashboardRecentTypeLabel', option.textContent.trim());
  closeCustomDropdowns();
  renderDashboardRecentUploads();
}

function renderDashboardRecentUploads() {
  const recEl = document.getElementById('dashRecentList');
  if (!recEl) return;
  const sorted = sortFilesByMode(filterFilesByType([...dashRecentFiles], dashRecentTypeFilter), dashRecentSortMode);
  recEl.innerHTML = sorted.length
    ? sorted.slice(0,5).map(f => makeRecentItem(f)).join('')
    : `<div class="empty-state">
      <div class="es-icon">${filledSvgIcon('file.svg', 'empty-svg-icon')}</div>
      <div class="es-text">
          No files yet - upload one to get started!
      </div>
  </div>`;
  }

function makeRecentItem(f) {
  return `
    <div class="recent-item file-folder-link" role="button" tabindex="0" onclick="openFileFolder(${f.id})" onkeydown="handleFileFolderKeydown(event, ${f.id})">
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
      ${fileSummaryButton(f)}
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
