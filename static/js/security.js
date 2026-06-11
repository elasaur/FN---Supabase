// static/js/security.js

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ACTIVITY_SYNC_MS = 5 * 60 * 1000;

(function secureSession() {
  const originalFetch = window.fetch.bind(window);
  let idleTimer = null;
  let expired = false;
  let nextActivitySyncAt = 0;
  let activitySyncInFlight = false;

  function clearTokenCache() {
    try {
      sessionStorage.removeItem('fn_access');
      sessionStorage.removeItem('fn_refresh');
    } catch (_) {}
  }

  function showExpiredSession() {
    if (expired) return;
    expired = true;
    clearTokenCache();

    originalFetch('/logout', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => {});

    if (typeof showSessionExpiredModal === 'function') {
      showSessionExpiredModal();
    } else {
      window.location.href = '/login?expired=1';
    }
  }

  function scheduleSessionExpiry(expiresAt) {
    if (expired) return;
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;
    const remainingMs = Math.max(0, expiresAtMs - Date.now());
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(showExpiredSession, remainingMs);
  }

  function scheduleInitialExpiry() {
    scheduleSessionExpiry(
      window.FILE_NEST_SESSION_EXPIRES_AT
      || new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString()
    );
  }

  async function syncServerActivity() {
    if (expired || activitySyncInFlight) return;
    const now = Date.now();
    if (now < nextActivitySyncAt) return;
    nextActivitySyncAt = now + SESSION_ACTIVITY_SYNC_MS;
    activitySyncInFlight = true;

    try {
      const response = await originalFetch('/api/session/activity', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const sessionExpiresAt = response.headers.get('X-Session-Expires-At');
      if (response.status === 401) {
        showExpiredSession();
      } else if (sessionExpiresAt) {
        scheduleSessionExpiry(sessionExpiresAt);
      }
    } catch (_) {
      nextActivitySyncAt = Date.now() + 60 * 1000;
    } finally {
      activitySyncInFlight = false;
    }
  }

  window.fetch = async function guardedFetch(input, init) {
    const response = await originalFetch(input, init);
    const sessionExpiresAt = response.headers.get('X-Session-Expires-At');
    if (response.status === 401) {
      try {
        const data = await response.clone().json();
        if (data && data.expired) showExpiredSession();
      } catch (_) {
        showExpiredSession();
      }
    } else if (sessionExpiresAt) {
      scheduleSessionExpiry(sessionExpiresAt);
    }
    return response;
  };

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, syncServerActivity, { passive: true });
  });

  scheduleInitialExpiry();
})();
