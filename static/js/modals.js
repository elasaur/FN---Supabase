// static/js/modals.js

function openModal(id) {
  const modal = document.getElementById('modal-' + id);
  modal.classList.add('open');
  restartModalIconAnimation(modal);
}

function closeModal(id) {
  document.getElementById('modal-' + id).classList.remove('open');
}

function showSessionExpiredModal() {
    openModal('sessionExpired');
}

function handleSessionExpired() {
    try {
      sessionStorage.removeItem('fn_access');
      sessionStorage.removeItem('fn_refresh');
    } catch (_) {}
    if (typeof clearAuthenticatedAppCache === 'function') clearAuthenticatedAppCache();
    window.location.href = "/login?expired=1";
}

document.addEventListener('DOMContentLoaded', () => {
  const modalIcons = {
    deleteAllFiles: 'warning.svg',
    deactivateAccount: 'warning.svg',
    deleteAccount: 'warning.svg',
    deleteFolder: 'warning.svg',
    deleteAllFolders: 'warning.svg',
    sessionExpired: 'session-timeout.svg',
  };

  Object.entries(modalIcons).forEach(([id, icon]) => {
    const modal = document.querySelector(`#modal-${id} .modal`);
    const iconSlot = modal?.firstElementChild;
    if (!iconSlot) return;
    iconSlot.classList.add('modal-icon-center');
    const badgeClass = id === 'sessionExpired' ? 'modal-alert-icon-bg session' : 'modal-alert-icon-bg';
    iconSlot.innerHTML = `<span class="${badgeClass}">${filledSvgIcon(icon, 'modal-svg-icon modal-warning-icon')}</span>`;
    iconSlot.style.fontSize = '';
    if (id !== 'sessionExpired') iconSlot.style.textAlign = 'center';
  });
});

function restartModalIconAnimation(modal) {
  modal?.querySelectorAll('.modal-warning-icon').forEach(icon => {
    icon.style.animation = 'none';
    icon.offsetHeight;
    icon.style.animation = '';
  });
}
