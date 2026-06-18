// static/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
  window.initialDataLoaded = false;
  updateDashboardGreeting?.();
  const hydrated = typeof hydrateAuthenticatedAppCache === 'function' && hydrateAuthenticatedAppCache();

  if (hydrated) {
    if (typeof renderEverywhereFromCache === 'function') renderEverywhereFromCache();
    window.initialDataLoaded = true;
    syncCachesSilently?.();
    return;
  }

  try {
    await loadDashboard();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not load dashboard data.', 'error');
  } finally {
    window.initialDataLoaded = true;
  }
});
