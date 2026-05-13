// static/js/modals.js

function openModal(id) {
  document.getElementById('modal-' + id).classList.add('open');
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
    window.location.href = "/login?expired=1";
}

document.addEventListener('DOMContentLoaded', () => {
  const modalIcons = {
    deleteAllFiles: 'https://img.icons8.com/pulsar-color/48/high-importance.png',
    deleteAccount: 'https://img.icons8.com/pulsar-color/48/high-importance.png',
    deleteFolder: 'https://img.icons8.com/pulsar-color/48/high-importance.png',
    deleteAllFolders: 'https://img.icons8.com/pulsar-color/48/high-importance.png',
    sessionExpired: 'https://img.icons8.com/pulsar-color/48/session-timeout.png',
  };

  Object.entries(modalIcons).forEach(([id, src]) => {
    const modal = document.querySelector(`#modal-${id} .modal`);
    const iconSlot = modal?.firstElementChild;
    if (!iconSlot) return;
    iconSlot.innerHTML = `<img class="ui-icon ui-icon-xl" src="${src}" alt="">`;
    iconSlot.style.fontSize = '';
    if (id !== 'sessionExpired') iconSlot.style.textAlign = 'center';
  });
});
