// static/js/navigation.js

pageTitles.notes = 'Notes';

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.add('active');

  if (el) el.classList.add('active');

  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) topbarTitle.textContent = pageTitles[page] || page;

  if (!window.initialDataLoaded && page === 'dashboard') loadDashboard();
  if (!window.initialDataLoaded && page === 'folders') loadFolders();
  if (!window.initialDataLoaded && page === 'files') loadAllFiles();
  if (!window.initialDataLoaded && page === 'stats') loadStats();
  if (!window.initialDataLoaded && page === 'upload') loadUploadFileList();

  if (page === 'notes') {
    renderNotesFolderOptions?.();
    loadNotes?.();
  }

  if (page === 'settings') loadMemberSince();
}

async function doLogout() {
  try {
    sessionStorage.removeItem('fn_access');
    sessionStorage.removeItem('fn_refresh');
  } catch (_) {}

  window.location.replace('/logout');
}