// static/js/security.js

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

(function secureSession() {
  const originalFetch = window.fetch.bind(window);
  let idleTimer = null;
  let expired = false;

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

  function resetIdleTimer() {
    if (expired) return;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(showExpiredSession, SESSION_TIMEOUT_MS);
  }

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, resetIdleTimer, { passive: true });
  });

  window.fetch = async function guardedFetch(input, init) {
    const response = await originalFetch(input, init);
    if (response.status === 401) {
      try {
        const data = await response.clone().json();
        if (data && data.expired) showExpiredSession();
      } catch (_) {
        showExpiredSession();
      }
    } else {
      resetIdleTimer();
    }
    return response;
  };

  resetIdleTimer();
})();
