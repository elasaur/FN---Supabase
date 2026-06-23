// static/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
  const appLoader = document.getElementById('appLoader');
  const hideAppLoader = () => appLoader?.classList.add('is-hidden');

  window.initialDataLoaded = false;
  updateDashboardGreeting?.();
  const hydrated = typeof hydrateAuthenticatedAppCache === 'function' && hydrateAuthenticatedAppCache();

  if (hydrated) {
    if (typeof renderEverywhereFromCache === 'function') renderEverywhereFromCache();
    window.initialDataLoaded = true;
    syncCachesSilently?.();
    hideAppLoader();
    return;
  }

  try {
    await loadDashboard();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not load dashboard data.', 'error');
  } finally {
    window.initialDataLoaded = true;
    hideAppLoader();
  }
});
