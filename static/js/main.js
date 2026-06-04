// static/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
  window.initialDataLoaded = false;
  updateDashboardGreeting?.();

  await Promise.allSettled([
    loadDashboard(),
    loadFolders(),
    loadAllFiles(),
    loadStats(),
    loadUploadFileList(),
    loadNotes(),
  ]);

  window.initialDataLoaded = true;
});