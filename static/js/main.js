// static/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
  window.initialDataLoaded = false;
  updateDashboardGreeting?.();
  try {
    await loadDashboard();
    if (typeof renderFolderGrid === 'function') renderFolderGrid();
    if (typeof sortAllFilesCache === 'function') sortAllFilesCache();
    if (typeof renderAllFilesTable === 'function') renderAllFilesTable();
    if (typeof renderUploadFileList === 'function') renderUploadFileList();
    if (typeof renderStatsFromCache === 'function') renderStatsFromCache();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not load dashboard data.', 'error');
  } finally {
    window.initialDataLoaded = true;
  }
});
