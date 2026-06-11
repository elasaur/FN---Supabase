// static/js/security.js

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ACTIVITY_SYNC_MS = 5 * 60 * 1000;

// Manages client-side session expiry checks and server activity sync.
(function secureSession() {
  const originalFetch = window.fetch.bind(window);
  let idleTimer = null;
  let expired = false;
  let nextActivitySyncAt = 0;
  let activitySyncInFlight = false;

  // Clears cached Supabase tokens from the current browser tab.
  function clearTokenCache() {
    try {
      sessionStorage.removeItem('fn_access');
      sessionStorage.removeItem('fn_refresh');
    } catch (_) {}
  }

  // Logs out locally and shows the expired-session UI once.
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

  // Schedules the client-side timeout from the server-provided expiry timestamp.
  function scheduleSessionExpiry(expiresAt) {
    if (expired) return;

    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;

    // Clamp negative values so an already-expired timestamp fires immediately.
    const remainingMs = Math.max(0, expiresAtMs - Date.now());

    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(showExpiredSession, remainingMs);
  }

  // Uses the rendered server timestamp first, then falls back to the default window.
  function scheduleInitialExpiry() {
    scheduleSessionExpiry(
      window.FILE_NEST_SESSION_EXPIRES_AT
      || new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString()
    );
  }

  // Extends the server session after real user activity, throttled to avoid noisy requests.
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
      // Retry sooner after network errors, but still avoid a tight retry loop.
      nextActivitySyncAt = Date.now() + 60 * 1000;
    } finally {
      activitySyncInFlight = false;
    }
  }

  // Wraps fetch so API responses can refresh or expire the session timer.
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

  // Any meaningful interaction can keep the server-side sliding session alive.
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, syncServerActivity, { passive: true });
  });

  scheduleInitialExpiry();
})();
