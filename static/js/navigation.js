// static/js/navigation.js

function updateTopbarCopy(title, subtitle) {
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarSub = document.getElementById('topbarSub');
  if (topbarTitle) topbarTitle.textContent = title || '';
  if (topbarSub) topbarSub.textContent = subtitle || '';
}

function runAfterNavigationPaint(callback) {
  if (typeof callback !== 'function') return;
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

function loadPageDataAfterPaint(page) {
  if (window.initialDataLoaded) return;
  runAfterNavigationPaint(() => {
    if (!document.getElementById('page-' + page)?.classList.contains('active')) return;
    if (page === 'dashboard') loadDashboard();
    if (page === 'folders') loadFolders();
    if (page === 'files') loadAllFiles();
    if (page === 'stats') loadStats();
    if (page === 'upload') loadUploadFileList();
  });
}

function navigate(page, el) {
  const nextPage = document.getElementById('page-' + page);
  if (!nextPage) return;

  const activePage = document.querySelector('.page.active');
  const activeNav = document.querySelector('.nav-item.active');
  if (activePage !== nextPage) activePage?.classList.remove('active');
  if (activeNav !== el) activeNav?.classList.remove('active');

  nextPage.classList.add('active');
  if (el) el.classList.add('active');
  updateTopbarCopy(pageTitles[page] || page, pageSubtitles[page] || '');

  loadPageDataAfterPaint(page);
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
  if (typeof clearAuthenticatedAppCache === 'function') clearAuthenticatedAppCache();
  window.location.replace('/logout');
}
