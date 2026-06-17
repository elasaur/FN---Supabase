// static/js/navigation.js

function updateTopbarCopy(title, subtitle) {
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarSub = document.getElementById('topbarSub');
  if (topbarTitle) topbarTitle.textContent = title || '';
  if (topbarSub) topbarSub.textContent = subtitle || '';
}

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');
  updateTopbarCopy(pageTitles[page] || page, pageSubtitles[page] || '');

  if (!window.initialDataLoaded && page === 'dashboard') loadDashboard();
  if (!window.initialDataLoaded && page === 'folders') loadFolders();
  if (!window.initialDataLoaded && page === 'files') loadAllFiles();
  if (!window.initialDataLoaded && page === 'stats') loadStats();
  if (!window.initialDataLoaded && page === 'upload') loadUploadFileList();
  if (page === 'settings') loadMemberSince();
}

async function doLogout() {
  openModal('logout');
}

async function confirmLogout() {
  try {
    sessionStorage.removeItem('fn_access');
    sessionStorage.removeItem('fn_refresh');
  } catch (_) {}
  window.location.replace('/logout');
}
