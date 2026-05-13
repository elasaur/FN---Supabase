
// --- Global Search Modal ---
var searchDebounce;
let lastSearchVal = '';

function closeSearchModal() {
  const modal = document.getElementById('searchModalDropdown');
  if (modal) modal.remove();
}

function showSearchModal(files, folders, searchVal) {
  closeSearchModal();
  const bar = document.querySelector('.search-bar');
  if (!bar) return;
  const modal = document.createElement('div');
  modal.className = 'search-modal';
  modal.id = 'searchModalDropdown';
  let html = '<div class="search-modal-list">';
  if (!files.length && !folders.length) {
    html += `<div class="search-modal-empty">No results for "${escHtml(searchVal)}"</div>`;
  } else {
    folders.forEach(f => {
      html += `<div class="search-modal-item" data-type="folder" data-id="${f.id}">
        <span class="search-modal-icon" data-icon="${escHtml(f.emoji)}">${folderIconHtml(f.emoji, '')}</span>
        <span class="search-modal-label">${escHtml(f.name)}</span>
        <span class="search-modal-tag folder">Folder</span>
      </div>`;
    });
    files.forEach(f => {
      html += `<div class="search-modal-item" data-type="file" data-id="${f.id}">
        <span class="search-modal-icon">${getExtIcon(f.original_name)}</span>
        <span class="search-modal-label">${escHtml(f.original_name)}</span>
        <span class="search-modal-tag file">File</span>
      </div>`;
    });
  }
  html += '</div>';
  modal.innerHTML = html;
  // Position modal below search bar, left-aligned and matching width
  const barRect = bar.getBoundingClientRect();
  modal.style.position = 'absolute';
  modal.style.left = bar.offsetLeft + 'px';
  modal.style.top = (bar.offsetTop + bar.offsetHeight + 4) + 'px';
  modal.style.width = bar.offsetWidth + 'px';
  modal.style.minWidth = bar.offsetWidth + 'px';
  modal.style.maxWidth = bar.offsetWidth + 'px';
  modal.style.transform = 'none';
  modal.style.marginTop = '0';
  bar.parentElement.appendChild(modal);

  // Click handler for navigation
  modal.querySelectorAll('.search-modal-item').forEach(item => {
    item.addEventListener('click', async function() {
      const type = this.getAttribute('data-type');
      const id = this.getAttribute('data-id');
      closeSearchModal();
      if (type === 'folder') {
        const label = this.querySelector('.search-modal-label')?.textContent || '';
        const emoji = this.querySelector('.search-modal-icon')?.dataset.icon || 'folder';
        navigate('folders', document.getElementById('nav-folders'));
        await loadFolders();
        await openFolderFiles(Number(id), label, emoji);
      } else if (type === 'file') {
        navigate('files', document.getElementById('nav-files'));
        await loadAllFiles();
        highlightFileRow(Number(id));
      }
    });
  });
}

// Highlight file row after navigation
function highlightFileRow(fileId) {
  const row = document.querySelector(`#allFilesTbody tr[data-file-id="${fileId}"]`);
  if (row) {
    row.classList.add('temp-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('temp-highlight'), 1200);
  }
}

async function onGlobalSearch(val, forceModal) {
  lastSearchVal = val;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    if (!val) { closeSearchModal(); return; }
    const [filesRes, foldersRes] = await Promise.all([
      fetch(`/api/files?sort=${window.allFilesSortMode||'date'}&search=${encodeURIComponent(val)}`),
      fetch(`/api/folders?search=${encodeURIComponent(val)}`)
    ]);
    const files = await filesRes.json();
    const folders = await foldersRes.json();
    showSearchModal(files, folders, val);
  }, forceModal ? 0 : 80);
}

// Register input and keydown handlers for global search bar
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('globalSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      onGlobalSearch(searchInput.value);
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        console.log('[DEBUG] Enter pressed in search bar, value:', searchInput.value);
        onGlobalSearch(searchInput.value, true);
      }
      if (e.key === 'Escape') {
        closeSearchModal();
      }
    });
    searchInput.addEventListener('blur', function() {
      setTimeout(closeSearchModal, 200);
    });
  }
});
