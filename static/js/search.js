
// --- Global Search Modal ---
let lastSearchVal = '';
let searchRequestId = 0;
let searchFetchTimer = null;

function closeSearchModal() {
  const modal = document.getElementById('searchModalDropdown');
  if (modal) modal.remove();
}

function encodeSearchData(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeSearchData(value, fallback = '') {
  try {
    return decodeURIComponent(value || '');
  } catch (_) {
    return fallback;
  }
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
      html += `<div class="search-modal-item" data-type="folder" data-id="${f.id}" data-name="${encodeSearchData(f.name)}" data-emoji="${encodeSearchData(f.emoji || 'folder')}" role="button" tabindex="0">
        <span class="search-modal-icon" data-icon="${encodeSearchData(f.emoji)}">${folderIconHtml(f.emoji, '')}</span>
        <span class="search-modal-label">${escHtml(f.name)}</span>
        <span class="search-modal-tag folder">Folder</span>
      </div>`;
    });

    files.forEach(f => {
      html += `<div class="search-modal-item" data-type="file" data-id="${f.id}" data-folder-id="${f.folder_id || ''}" data-folder-name="${encodeSearchData(f.folder_name || 'Folder')}" data-folder-emoji="${encodeSearchData(f.folder_emoji || 'folder')}" role="button" tabindex="0">
        <span class="search-modal-icon">${getExtIcon(f.original_name)}</span>
        <span class="search-modal-label">${escHtml(f.original_name)}</span>
        <span class="search-modal-tag file">File</span>
      </div>`;
    });
  }

  html += '</div>';
  modal.innerHTML = html;

  // Position modal below search bar, left-aligned and matching width
  modal.style.position = 'absolute';
  modal.style.left = bar.offsetLeft + 'px';
  modal.style.top = (bar.offsetTop + bar.offsetHeight + 4) + 'px';
  modal.style.width = bar.offsetWidth + 'px';
  modal.style.minWidth = bar.offsetWidth + 'px';
  modal.style.maxWidth = bar.offsetWidth + 'px';
  modal.style.transform = 'none';
  modal.style.marginTop = '0';
  bar.parentElement.appendChild(modal);

  // Select on pointerdown so input blur cannot remove the dropdown before navigation.
  modal.querySelectorAll('.search-modal-item').forEach(item => {
    item.addEventListener('pointerdown', event => {
      event.preventDefault();
      selectSearchResult(item);
    });
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectSearchResult(item);
    });
  });
}

async function selectSearchResult(item) {
  const type = item.getAttribute('data-type');
  const id = Number(item.getAttribute('data-id'));

  closeSearchModal();

  if (type === 'folder') {
    const label = decodeSearchData(item.getAttribute('data-name'), item.querySelector('.search-modal-label')?.textContent || '');
    const emoji = decodeSearchData(item.getAttribute('data-emoji'), 'folder');

    await openFolderFiles(id, label, emoji);
    return;
  }

  if (type === 'file') {
    const folderId = Number(item.getAttribute('data-folder-id'));
    const folderName = decodeSearchData(item.getAttribute('data-folder-name'), 'Folder');
    const folderEmoji = decodeSearchData(item.getAttribute('data-folder-emoji'), 'folder');

    await loadAllFiles();
    if (folderId) {
      await openFolderFiles(folderId, folderName, folderEmoji);
      return;
    }

    openFileFolder(id);
  }
}

function showSearchLoading(searchVal) {
  closeSearchModal();
  const bar = document.querySelector('.search-bar');
  if (!bar || !searchVal) return;

  const modal = document.createElement('div');
  modal.className = 'search-modal';
  modal.id = 'searchModalDropdown';
  modal.innerHTML = '<div class="search-modal-list"><div class="search-modal-empty">Searching...</div></div>';

  modal.style.position = 'absolute';
  modal.style.left = bar.offsetLeft + 'px';
  modal.style.top = (bar.offsetTop + bar.offsetHeight + 4) + 'px';
  modal.style.width = bar.offsetWidth + 'px';
  modal.style.minWidth = bar.offsetWidth + 'px';
  modal.style.maxWidth = bar.offsetWidth + 'px';
  modal.style.transform = 'none';
  modal.style.marginTop = '0';
  bar.parentElement.appendChild(modal);
}

function getLocalSearchResults(searchVal) {
  const term = String(searchVal || '').toLowerCase();
  const files = Array.isArray(allFiles)
    ? allFiles.filter(file => String(file.original_name || '').toLowerCase().includes(term))
    : [];
  const folders = Array.isArray(allFolders)
    ? allFolders.filter(folder => String(folder.name || '').toLowerCase().includes(term))
    : [];

  return { files, folders };
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
  const searchVal = String(val || '').trim();
  lastSearchVal = searchVal;
  const requestId = ++searchRequestId;
  clearTimeout(searchFetchTimer);

  if (!searchVal) {
    closeSearchModal();
    return;
  }

  const localResults = getLocalSearchResults(searchVal);
  const hasLocalCache = (Array.isArray(allFiles) && allFiles.length) || (Array.isArray(allFolders) && allFolders.length);

  if (hasLocalCache) {
    showSearchModal(localResults.files, localResults.folders, searchVal);
  } else {
    showSearchLoading(searchVal);
  }

  searchFetchTimer = setTimeout(async function() {
    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch(`/api/files?sort=${fileSortApiParam(allFilesSortMode)}&search=${encodeURIComponent(searchVal)}`),
        fetch(`/api/folders?search=${encodeURIComponent(searchVal)}`)
      ]);
      const files = await filesRes.json();
      const folders = await foldersRes.json();
      if (requestId !== searchRequestId || searchVal !== lastSearchVal) return;
      showSearchModal(
        Array.isArray(files) ? files : [],
        Array.isArray(folders) ? folders : [],
        searchVal
      );
    } catch (err) {
      if (requestId === searchRequestId && !hasLocalCache) {
        showSearchModal([], [], searchVal);
      }
    }
  }, hasLocalCache ? 180 : 0);
}

// Register input and keydown handlers for global search bar
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('globalSearch');
  if (searchInput) {
    const searchBar = document.querySelector('.search-bar');

    if (searchBar) {
      searchBar.addEventListener('click', function() {
        searchInput.focus();

        if (searchInput.value.trim()) {
          onGlobalSearch(searchInput.value, true);
        }
      });
    }

    searchInput.addEventListener('input', function() {
      onGlobalSearch(searchInput.value);
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        onGlobalSearch(searchInput.value, true);
      }
      if (e.key === 'Escape') {
        closeSearchModal();
      }
    });

    document.addEventListener('pointerdown', function(e) {
      if (e.target.closest('.search-bar') || e.target.closest('#searchModalDropdown')) {
        return;
      }

      closeSearchModal();
    });
  }
});
