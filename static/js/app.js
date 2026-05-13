// ══════════════════════════════════════════════════════════════
// FILE NEST · Frontend Application Logic
// ══════════════════════════════════════════════════════════════

const EXT_ICONS = {
  pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊',
  ppt:'📊', pptx:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️',
  gif:'🖼️', mp3:'🎵', mp4:'🎬', wav:'🎵', txt:'📃',
  zip:'🗜️', rar:'🗜️', csv:'📊',
};

const COLOR_OPTIONS = [
  { val:'#e8855a', bg:'#fde8de' },
  { val:'#7ecfb3', bg:'#d9f5ec' },
  { val:'#9b87d4', bg:'#ede8f8' },
  { val:'#7ec8e3', bg:'#e0f4fb' },
  { val:'#f5a7c7', bg:'#fce8f3' },
  { val:'#e8b84b', bg:'#fef7dd' },
  { val:'#e87a7a', bg:'#fde8e8' },
  { val:'#52b788', bg:'#d8f3e8' },
  { val:'#6c757d', bg:'#f0f0f0' },
  { val:'#c77dff', bg:'#f3e8ff' },
];

const FOLDER_EMOJIS = [
  '📁','📂','📚','📖','📝','📋','📊','📈','💼','🗂️',
  '🗃️','🗄️','📌','📎','✏️','💰','💳','🧾','🏥','⚖️',
  '🔬','🧪','💻','🖥️','📸','🎵','🎬','🎨','🏠','✈️',
  '🚗','🍽️','💪','🐾','🎓','🏆','🔑','🛡️','⭐','🌿',
];

let currentFile       = null;
let currentAnalysis   = null;
let selectedFolderObj = null;
let allFolders        = [];
let allFiles          = [];
let folderSortMode    = 'name';
let allFilesSortMode  = 'name';
let uploadSortMode    = 'date';
let pickedColor       = COLOR_OPTIONS[0];
let pickedEmoji       = '📁';   // tracks selected emoji in the inline new-folder panel
let cfPickedColor     = COLOR_OPTIONS[0];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getExt(name) { return (name.split('.').pop() || '').toLowerCase(); }
function getExtIcon(name) { return EXT_ICONS[getExt(name)] || '📄'; }
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function parseAppDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr);
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeAgo(dateStr) {
  const d = parseAppDate(dateStr);
  if (!d) return 'Just now';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function apiapiFetch(url, options = {}) {
  const res = await apiFetch(url, {
    ...options,
    credentials: 'include'
  });

  if (res.status === 401) {
    showSessionExpiredModal();
    throw new Error("Session expired");
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw data || { message: "Request failed" };
  }

  return data;
}

// ── Navigation ────────────────────────────────────────────────────────────────
const pageTitles = {
  dashboard:'Dashboard', upload:'Upload Files',
  folders:'All Folders', files:'All Files', stats:'Statistics', settings:'Settings',
};

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('topbarTitle').textContent = pageTitles[page] || page;
  if (page === 'dashboard') loadDashboard();
  if (page === 'folders')   loadFolders();
  if (page === 'files')     loadAllFiles();
  if (page === 'stats')     loadStats();
  if (page === 'upload')    loadUploadFileList();
}

async function doLogout() { window.location.href = '/logout'; }

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const res  = await apiapiFetch('/api/stats');
  const data = await res.json();
  document.getElementById('dashTotalFolders').textContent = data.total_folders;
  document.getElementById('dashTotalFiles').textContent   = data.total_files;
  document.getElementById('dashRecentCount').textContent  = data.recent_count;
  document.getElementById('dashAiSorted').textContent     = data.ai_sorted;

  const fRes = await apiFetch('/api/folders');
  allFolders = await fRes.json();
  const pinned   = allFolders.filter(f => f.pinned);
  const pinnedEl = document.getElementById('dashPinnedFolders');
  pinnedEl.innerHTML = pinned.length
    ? pinned.map(f => makeFolderCard(f, true)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;padding:20px;"><div class="es-icon">📌</div><div class="es-text">No pinned folders — pin one from the Folders page!</div></div>`;

  const rfRes = await apiFetch('/api/files?sort=date');
  const files = await rfRes.json();
  const recEl = document.getElementById('dashRecentList');
  recEl.innerHTML = files.length
    ? files.slice(0,5).map(f => makeRecentItem(f)).join('')
    : `<div class="empty-state"><div class="es-icon">🪺</div><div class="es-text">No files yet — upload one to get started!</div></div>`;
}

function makeRecentItem(f) {
  const createdAt = parseAppDate(f.created_at);
  const isNew = createdAt && (Date.now() - createdAt.getTime()) < 24 * 3600 * 1000;
  return `
    <div class="recent-item">
      <div class="recent-file-icon">${getExtIcon(f.original_name)}</div>
      <div class="recent-meta">
        <div class="recent-name">${f.original_name}${isNew ? ' <span class="new-badge">NEW</span>' : ''}</div>
        <div class="recent-info">${f.folder_emoji} ${f.folder_name} · ${getExt(f.original_name).toUpperCase()} · ${formatSize(f.file_size)}</div>
      </div>
      <div class="recent-date">${timeAgo(f.created_at)}</div>
      <button class="action-btn" onclick="downloadFile(${f.id},'${escHtml(f.original_name)}')" title="Download">⬇️</button>
    </div>`;
}

// ── Recent ────────────────────────────────────────────────────────────────────
async function loadRecent() {
  const res   = await apiFetch('/api/files?sort=date');
  const files = await res.json();
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent  = files.filter(f => {
    const createdAt = parseAppDate(f.created_at);
    return createdAt && createdAt.getTime() > weekAgo;
  });
  const el = document.getElementById('recentList');
  el.innerHTML = recent.length
    ? recent.map(f => makeRecentItem(f)).join('')
    : `<div class="empty-state"><div class="es-icon">🪺</div><div class="es-text">No recent files in the last 7 days.</div></div>`;
}

// ── Folders ───────────────────────────────────────────────────────────────────
async function loadFolders() {
  const res = await apiFetch('/api/folders');
  allFolders = await res.json();
  renderFolderGrid();
}

function setFolderSort(mode, el) {
  folderSortMode = mode;
  document.querySelectorAll('#page-folders .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderFolderGrid();
}

function renderFolderGrid() {
  let sorted = [...allFolders];
  if (folderSortMode === 'name')   sorted.sort((a,b) => a.name.localeCompare(b.name));
  if (folderSortMode === 'count')  sorted.sort((a,b) => (b.file_count||0)-(a.file_count||0));
  if (folderSortMode === 'pinned') sorted.sort((a,b) => b.pinned - a.pinned);
  const el = document.getElementById('allFoldersList');
  el.innerHTML = sorted.map(f => makeFolderCard(f, false)).join('');
  el.innerHTML += `<div class="add-folder-card" onclick="openCreateFolderModal()"><div class="plus">＋</div><div style="font-weight:700;font-size:0.85rem;">New Folder</div></div>`;
}

function makeFolderCard(f, minimal) {
  const pinDot  = f.pinned ? '<div class="pinned-dot"></div>' : '';
  const count   = f.file_count || 0;
  const actions = minimal ? '' : `
    <div class="folder-top-right" onclick="event.stopPropagation()">
      <div class="folder-badge">${count}</div>
      <div class="folder-menu-wrap">
        <button class="folder-menu-btn" onclick="toggleFolderMenu(this)" title="Options">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
        <div class="folder-menu-dropdown">
          <button onclick="openFolderFiles(${f.id},'${escHtml(f.name)}','${f.emoji}');closeFolderMenus()">📂 Open</button>
          <button onclick="openRenameModal(${f.id},'${escHtml(f.name)}','${f.emoji}');closeFolderMenus()">✏️ Rename</button>
          <button onclick="togglePin(${f.id},${f.pinned});closeFolderMenus()">${f.pinned ? '📌 Unpin' : '📌 Pin'}</button>
          ${!f.is_default ? `<button class="danger" onclick="deleteFolder(${f.id});closeFolderMenus()">🗑️ Delete</button>` : ''}
        </div>
      </div>
    </div>`;
  return `
    <div class="folder-card" style="--folder-color:${f.color};" onclick="openFolderFiles(${f.id},'${escHtml(f.name)}','${f.emoji}')">
      ${pinDot}
      ${actions}
      <span class="folder-emoji">${f.emoji}</span>
      <div class="folder-name">${escHtml(f.name)}</div>
      <div class="folder-count">${count} file${count!==1?'s':''}</div>
    </div>`;
}

function toggleFolderMenu(btn) {
  const dropdown = btn.nextElementSibling;
  const isOpen   = dropdown.classList.contains('open');
  closeFolderMenus();
  if (!isOpen) dropdown.classList.add('open');
}

function closeFolderMenus() {
  document.querySelectorAll('.folder-menu-dropdown.open')
    .forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', closeFolderMenus);

async function togglePin(id, currentPinned) {
  await apiFetch(`/api/folders/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ pinned: currentPinned ? 0 : 1 }),
  });
  await loadFolders();
  showToast(currentPinned ? '📌 Folder unpinned.' : '📌 Folder pinned!', 'success');
}

async function deleteFolder(id) {
  if (!confirm('Delete this folder? Files inside will be moved to Uncategorized.')) return;
  const res  = await apiFetch(`/api/folders/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('🗑️ Folder deleted.', 'warn'); await loadFolders(); }
  else showToast(data.message, 'error');
}

async function openFolderFiles(folderId, folderName, emoji) {
  document.getElementById('folderFilesTitle').textContent = `${emoji} ${folderName}`;
  const listEl = document.getElementById('folderFilesList');
  listEl.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div></div>';
  openModal('folderFiles');
  const res   = await apiFetch(`/api/files?folder_id=${folderId}&sort=name`);
  const files = await res.json();
  if (!files.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">📂</div><div class="es-text">No files in this folder yet.</div></div>`;
    return;
  }
  listEl.innerHTML = files.map(f => `
    <div class="file-item" style="animation:none;">
      <div class="fi-icon" style="background:${f.folder_bg||'var(--bg)'};">${getExtIcon(f.original_name)}</div>
      <div class="fi-info">
        <div class="fi-name">${escHtml(f.original_name)}</div>
        <div class="fi-meta">${getExt(f.original_name).toUpperCase()} · ${formatSize(f.file_size)} · ${timeAgo(f.created_at)}</div>
      </div>
      <span class="fi-size">${formatSize(f.file_size)}</span>
      <button class="fi-open" onclick="downloadFile(${f.id},'${escHtml(f.original_name)}')" title="Download">⬇️</button>
      <button class="fi-delete" onclick="deleteFileFromModal(${f.id},${folderId},'${escHtml(folderName)}','${emoji}')" title="Delete">🗑️</button>
    </div>`).join('');
}

async function deleteFileFromModal(fileId, folderId, folderName, emoji) {
  if (!confirm('Delete this file permanently?')) return;
  const res  = await apiFetch(`/api/files/${fileId}`, { method:'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('🗑️ File deleted.', 'warn'); openFolderFiles(folderId, folderName, emoji); loadFolders(); }
  else showToast(data.message, 'error');
}

// ── All Files ──────────────────────────────────────────────────────────────────
async function loadAllFiles(search) {
  let url = `/api/files?sort=${allFilesSortMode}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const res = await apiFetch(url);
  allFiles = await res.json();
  renderAllFilesTable();
}

function setAllFilesSort(mode, el) {
  allFilesSortMode = mode;
  document.querySelectorAll('#page-files .sort-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  loadAllFiles();
}

function renderAllFilesTable() {
  const tbody = document.getElementById('allFilesTbody');
  if (!allFiles.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3);">No files yet. Upload some to get started!</td></tr>`;
    return;
  }
  tbody.innerHTML = allFiles.map(f => `
    <tr>
      <td><span style="font-size:1.1rem;">${getExtIcon(f.original_name)}</span> <span style="font-weight:700;">${escHtml(f.original_name)}</span>${f.ai_sorted?' <span style="font-size:0.65rem;background:var(--lavender2);color:var(--lavender);padding:1px 6px;border-radius:8px;font-weight:800;">AI</span>':''}</td>
      <td><span style="font-size:0.72rem;background:var(--bg);padding:2px 8px;border-radius:6px;font-weight:700;color:var(--text2);">${getExt(f.original_name).toUpperCase()||'—'}</span></td>
      <td><span class="file-folder-tag" style="background:${f.folder_bg};color:${f.folder_color};">${f.folder_emoji} ${escHtml(f.folder_name)}</span></td>
      <td style="color:var(--text3);font-size:0.82rem;">${formatSize(f.file_size)}</td>
      <td style="color:var(--text3);font-size:0.82rem;">${timeAgo(f.created_at)}</td>
      <td>
        <button class="action-btn" onclick="downloadFile(${f.id},'${escHtml(f.original_name)}')" title="Download">⬇️</button>
        <button class="action-btn del" onclick="deleteFileById(${f.id})" title="Delete">🗑️</button>
      </td>
    </tr>`).join('');
}

async function deleteFileById(id) {
  if (!confirm('Delete this file permanently?')) return;
  const res  = await apiFetch(`/api/files/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('🗑️ File deleted.', 'warn'); loadAllFiles(); loadFolders(); }
  else showToast(data.message, 'error');
}

function downloadFile(id, name) { window.location.href = `/api/files/${id}/download`; }

// ── Statistics ─────────────────────────────────────────────────────────────────
async function loadStats() {
  const [statsRes, chartRes, filesRes] = await Promise.all([
    apiFetch('/api/stats'), apiFetch('/api/stats/chart'), apiFetch('/api/files'),
  ]);
  const stats     = await statsRes.json();
  const chartData = await chartRes.json();
  const files     = await filesRes.json();

  document.getElementById('statTotal').textContent  = stats.total_files;
  document.getElementById('statAI').textContent     = stats.ai_sorted;
  document.getElementById('statManual').textContent = stats.total_files - stats.ai_sorted;

  const maxCount   = chartData.length ? Math.max(...chartData.map(d=>d.count),1) : 1;
  const folderBars = document.getElementById('folderChartBars');
  folderBars.innerHTML = chartData.length
    ? chartData.map(d=>`
        <div class="chart-bar-row">
          <div class="chart-bar-label">${d.emoji} ${escHtml(d.name)}</div>
          <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.max(4,(d.count/maxCount)*100)}%;background:${d.color};">${d.count>0?d.count:''}</div></div>
          <div class="chart-count">${d.count}</div>
        </div>`).join('')
    : `<div class="empty-state"><div class="es-text">No data yet.</div></div>`;

  const extCount  = {};
  const extColors = { pdf:'#e8855a',docx:'#7ec8e3',xlsx:'#7ecfb3',jpg:'#9b87d4',jpeg:'#9b87d4',png:'#9b87d4',mp3:'#f5a7c7',mp4:'#7ec8e3',txt:'#b09e94',pptx:'#e8b84b',csv:'#52b788' };
  files.forEach(f => { const ext=getExt(f.original_name)||'other'; extCount[ext]=(extCount[ext]||0)+1; });
  const extSorted = Object.entries(extCount).sort((a,b)=>b[1]-a[1]);
  const maxExt    = extSorted.length ? Math.max(...extSorted.map(e=>e[1]),1) : 1;
  const typeBars  = document.getElementById('typeChartBars');
  typeBars.innerHTML = extSorted.length
    ? extSorted.slice(0,8).map(([ext,count])=>{
        const color=extColors[ext]||'#b09e94', icon=EXT_ICONS[ext]||'📄';
        return `<div class="chart-bar-row">
          <div class="chart-bar-label">${icon} ${ext.toUpperCase()}</div>
          <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.max(4,(count/maxExt)*100)}%;background:${color};">${count>0?count:''}</div></div>
          <div class="chart-count">${count}</div>
        </div>`;}).join('')
    : `<div class="empty-state"><div class="es-text">No data yet.</div></div>`;
}

// ── Upload / Analyze ───────────────────────────────────────────────────────────
function onDragOver(e)  { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); }
function onDragLeave(e) { document.getElementById('uploadZone').classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
}

async function handleFiles(files) {
  if (!files || !files.length) return;
  const file = files[0];
  currentFile = file;

  // ── AI gate ──
  if (!aiEnabled) {
    showPredictionCard(file, { keywords: [], ranked: [] });
    return;
  }

  document.getElementById('uploadZoneTitle').textContent = `Analyzing "${file.name}"…`;
  document.getElementById('predictionCard').classList.remove('show');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res  = await apiFetch('/api/analyze', { method:'POST', body:formData });
    const data = await res.json();

    // 🔥 SESSION EXPIRED HANDLER (ADD THIS)
    if (data.expired) {
      showSessionExpiredModal();
      return;
    }

    // ❌ existing error handler
    if (!data.success) {
      showToast(data.message, 'error');
      resetUploadZone();
      return;
    }

    // ✅ success
    currentAnalysis = data.analysis;
    showPredictionCard(file, data.analysis);

  } catch (err) {
    showToast('Analysis failed. Please try again.', 'error');
  } finally {
    resetUploadZone();
  }
}

(async function init() {
  await loadDashboard();
  await apiFetch('/api/folders').then(r => r.json()).then(d => { allFolders = d; });

  // Restore AI toggle state
  document.getElementById('ai-toggle').classList.toggle('on', aiEnabled);
})();

function resetUploadZone() {
  document.getElementById('uploadZoneTitle').textContent = 'Drag & drop your file here';
}

// ── Prediction Card ────────────────────────────────────────────────────────────
function showPredictionCard(file, analysis) {
  document.getElementById('predFileIcon').textContent = getExtIcon(file.name);
  document.getElementById('predFileName').textContent = file.name;
  document.getElementById('predFileMeta').textContent =
    `${getExt(file.name).toUpperCase()} · ${formatSize(file.size)} · Uploaded just now`;

  // Keyword chips
  const kwRow   = document.getElementById('keywordsRow');
  kwRow.innerHTML = '<span class="kw-label">🔑 Keywords detected:</span>';
  const keywords  = analysis.keywords || [];
  if (keywords.length) {
    keywords.forEach((kw, i) => {
      const chip = document.createElement('span');
      chip.className = 'kw-tag';
      chip.textContent = kw;
      chip.style.animationDelay = (i * 0.06) + 's';
      kwRow.appendChild(chip);
    });
  } else {
    const empty = document.createElement('span');
    empty.style.cssText = 'font-size:0.78rem;color:var(--text3);font-style:italic;';
    empty.textContent = 'No keywords detected';
    kwRow.appendChild(empty);
  }

  const ranked = analysis.ranked || [];
  selectedFolderObj = ranked.length ? ranked[0] : null;

  const top = ranked.length ? ranked[0] : null;
  document.getElementById('confPct').textContent = top
    ? `${top.emoji} ${top.folder}`
    : 'No match';

  const confWrap = document.getElementById('confBarWrap');
  if (confWrap) confWrap.style.display = 'none';

  // Render recommendation cards
  const recList = document.getElementById('recList');
  recList.innerHTML = '';

  if (!ranked.length) {
    const notice = document.createElement('div');
    notice.className = 'uncategorized-notice';
    notice.textContent = '⚠️ Could not detect folder. Please pick one below or create a new folder.';
    recList.appendChild(notice);
  } else {
    const rankLabels  = ['🥇 Best Match', '🥈 2nd Match', '🥉 3rd Match'];
    const rankClasses = ['rank-1', 'rank-2', 'rank-3', 'rank-other'];

    ranked.slice(0, 3).forEach((r, idx) => {
      const isSelected = idx === 0;
      const card = document.createElement('div');
      card.className = 'rec-card' + (isSelected ? ' selected' : '');
      card.style.setProperty('--rc-color', r.color);
      card.style.setProperty('--rc-bg',    r.bg);

      const newBadge = r.is_new
        ? `<span style="background:var(--mint);color:#fff;font-size:0.62rem;font-weight:900;padding:2px 7px;border-radius:10px;margin-left:4px;">NEW</span>`
        : '';

      card.innerHTML = `
        <div class="rec-select-check">${isSelected ? '✓' : ''}</div>
        <div class="rec-top">
          <span class="rec-emoji">${r.emoji}</span>
          <span class="rec-name">${r.emoji} ${escHtml(r.folder)}${newBadge}</span>
          <span class="rec-rank-badge ${rankClasses[idx]||'rank-other'}">${rankLabels[idx]||`#${idx+1}`}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:8px;font-style:italic;">
          ${escHtml(r.reason || '')}
        </div>
        <div class="rec-kws" id="chips-${idx}"></div>`;

      card.onclick = () => {
        document.querySelectorAll('.rec-card').forEach(c => {
          c.classList.remove('selected');
          const chk = c.querySelector('.rec-select-check');
          if (chk) chk.textContent = '';
        });
        card.classList.add('selected');
        card.querySelector('.rec-select-check').textContent = '✓';
        selectedFolderObj = r;
      };

      recList.appendChild(card);

      const chipsEl = card.querySelector(`#chips-${idx}`);
      if (keywords.length) {
        keywords.slice(0, 5).forEach(kw => {
          const chip = document.createElement('span');
          chip.className = 'rec-kw';
          chip.textContent = kw;
          chipsEl.appendChild(chip);
        });
      } else {
        chipsEl.innerHTML = `<span class="rec-no-kw">No keywords</span>`;
      }
    });
  }

  buildAllFoldersPicker(analysis);
  document.getElementById('predictionCard').classList.add('show');

  if (ranked.length) {
    showToast(`🧠 Best match: ${top.emoji} ${top.folder}${top.is_new ? ' (new folder)' : ''}`, 'info');
  } else {
    showToast('🤔 No match found — please pick a folder manually.', 'warn');
  }
}

function buildAllFoldersPicker(analysis) {
  const opts = document.getElementById('folderOptions');
  opts.innerHTML = '';
  document.getElementById('allFoldersWrap').style.display = 'none';
  document.getElementById('showAllBtn').textContent = 'Show all folders ▾';

  allFolders.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'folder-option';
    btn.style.setProperty('--rc-color', f.color);
    btn.innerHTML = `${f.emoji} ${escHtml(f.name)}`;
    btn.onclick = () => {
      document.querySelectorAll('.folder-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFolderObj = { folder:f.name, emoji:f.emoji, color:f.color, bg:f.bg, _db_id:f.id };
    };
    opts.appendChild(btn);
  });
}

function toggleAllFolders() {
  const wrap = document.getElementById('allFoldersWrap');
  const btn  = document.getElementById('showAllBtn');
  if (wrap.style.display === 'none') { wrap.style.display = 'block'; btn.textContent = 'Hide folders ▲'; }
  else                               { wrap.style.display = 'none';  btn.textContent = 'Show all folders ▾'; }
}

// ── New Folder Panel (inline, inside prediction card) ─────────────────────────
function toggleNewFolder() {
  const panel  = document.getElementById('newFolderPanel');
  const isOpen = panel.classList.contains('show');
  if (!isOpen) {
    panel.classList.add('show');
    buildEmojiPicker();
    buildColorPicker('colorPicker', c => { cfPickedColor = c; });
  } else {
    panel.classList.remove('show');
  }
}

function buildEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  if (!picker) return;
  picker.innerHTML = '';
  pickedEmoji = '📁';   // reset on each open
  FOLDER_EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'emoji-opt' + (em === pickedEmoji ? ' picked' : '');
    btn.textContent = em;
    btn.title       = em;
    btn.onclick = () => {
      pickedEmoji = em;
      picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('picked'));
      btn.classList.add('picked');
    };
    picker.appendChild(btn);
  });
}

function buildColorPicker(containerId, onPick) {
  const cp = document.getElementById(containerId);
  if (!cp) return;
  cp.innerHTML = '';
  COLOR_OPTIONS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'color-opt' + (i === 0 ? ' picked' : '');
    btn.style.background = c.val;
    btn.onclick = () => {
      cp.querySelectorAll('.color-opt').forEach(b => b.classList.remove('picked'));
      btn.classList.add('picked');
      if (onPick) onPick(c);
    };
    cp.appendChild(btn);
  });
}

// Called by onclick="createNewFolder()" in the HTML
async function createNewFolder() {
  const name = document.getElementById('nfName').value.trim();
  if (!name) { showToast('Please enter a folder name.', 'warn'); return; }

  const res  = await apiFetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      emoji: pickedEmoji,
      color: cfPickedColor.val,
      bg:    cfPickedColor.bg,
    }),
  });
  const data = await res.json();
  if (!data.success) { showToast(data.message, 'error'); return; }

  const f = data.folder;
  allFolders.push(f);
  selectedFolderObj = { folder:f.name, emoji:f.emoji, color:f.color, bg:f.bg, _db_id:f.id };

  showToast(`📁 Folder "${name}" created and selected!`, 'success');
  document.getElementById('newFolderPanel').classList.remove('show');
  document.getElementById('nfName').value = '';
  buildAllFoldersPicker(currentAnalysis || { ranked: [] });
}

function cancelUpload() {
  document.getElementById('predictionCard').classList.remove('show');
  currentFile = null; currentAnalysis = null; selectedFolderObj = null;
  document.getElementById('fileInput').value = '';
  showToast('Upload cancelled.', 'warn');
}

// ── Confirm Upload ─────────────────────────────────────────────────────────────
async function confirmUpload() {
  if (!currentFile) { showToast('No file selected.', 'warn'); return; }

  let folderId = null;
  let aiSorted = false;

  if (selectedFolderObj) {
    const name = selectedFolderObj.folder || selectedFolderObj.name;

    // Case 1: picked from folder picker — _db_id already set
    if (selectedFolderObj._db_id) {
      folderId = selectedFolderObj._db_id;
      aiSorted = false;
    } else {
      // Case 2: check if folder already exists (case-insensitive)
      let existing = allFolders.find(f => f.name.toLowerCase() === name.toLowerCase());

      // Case 3: folder doesn't exist yet — create it automatically
      if (!existing) {
        const res = await apiFetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            emoji: selectedFolderObj.emoji || '📁',
            color: selectedFolderObj.color || '#7ec8e3',
            bg:    selectedFolderObj.bg    || '#e0f4fb',
          }),
        });
        const d = await res.json();
        if (d.success) {
          allFolders.push(d.folder);
          existing = d.folder;
          showToast(`📁 Folder "${name}" created!`, 'success');
        } else {
          showToast(d.message || 'Could not create folder.', 'error');
          return;
        }
      }

      folderId = existing.id;
      aiSorted = true;
    }
  }

  // Last resort — use Uncategorized if nothing selected
  if (!folderId) {
    const unc = allFolders.find(f => f.is_default);
    if (unc) {
      folderId = unc.id;
      showToast('⚠️ No folder selected — saving to Uncategorized.', 'warn');
    } else {
      showToast('Please select a folder.', 'warn');
      return;
    }
  }

  const formData = new FormData();
  formData.append('file',      currentFile);
  formData.append('folder_id', folderId);
  formData.append('ai_sorted', aiSorted ? '1' : '0');
  formData.append('keywords',  (currentAnalysis?.keywords || []).join(','));

  const res  = await apiFetch('/api/upload', { method:'POST', body:formData });
  const data = await res.json();
  if (!data.success) { showToast(data.message, 'error'); return; }

  document.getElementById('predictionCard').classList.remove('show');
  const folderName = selectedFolderObj
    ? (selectedFolderObj.folder || selectedFolderObj.name)
    : 'Uncategorized';
  document.getElementById('successTitle').textContent = `"${currentFile.name}" sorted successfully! 🎉`;
  document.getElementById('successSub').textContent   = `Moved to ${folderName} · ${formatSize(currentFile.size)}`;
  const sf = document.getElementById('successFlash');
  sf.classList.add('show');
  setTimeout(() => sf.classList.remove('show'), 3500);

  currentFile = null; currentAnalysis = null; selectedFolderObj = null;
  document.getElementById('fileInput').value = '';
  showToast(`✅ Saved to ${folderName}`, 'success');
  await loadUploadFileList();
  await loadFolders();
}

// ── Upload File List ───────────────────────────────────────────────────────────
async function loadUploadFileList(sortMode) {
  if (sortMode) uploadSortMode = sortMode;
  const res   = await apiFetch(`/api/files?sort=${uploadSortMode}`);
  const files = await res.json();
  const list    = document.getElementById('fileList');
  const countEl = document.getElementById('filesCount');
  countEl.textContent = files.length;
  if (!files.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon">🪺</div><div class="es-text">No files yet — upload one above to get started!</div></div>`;
    return;
  }
  list.innerHTML = files.map((f, idx) => `
    <div class="file-item" style="animation-delay:${idx*0.04}s;">
      <div class="fi-icon" style="background:${f.folder_bg||'var(--bg)'};">${getExtIcon(f.original_name)}</div>
      <div class="fi-info">
        <div class="fi-name">${escHtml(f.original_name)}</div>
        <div class="fi-meta">${getExt(f.original_name).toUpperCase()} · ${timeAgo(f.created_at)}</div>
      </div>
      <span class="fi-folder" style="background:${f.folder_bg};color:${f.folder_color};">${f.folder_emoji} ${escHtml(f.folder_name)}</span>
      <span class="fi-size">${formatSize(f.file_size)}</span>
      <button class="fi-open"   onclick="downloadFile(${f.id},'${escHtml(f.original_name)}')" title="Download">⬇️</button>
      <button class="fi-delete" onclick="deleteFileUpload(${f.id})" title="Delete">🗑️</button>
    </div>`).join('');
}

function sortFiles(mode, el) {
  uploadSortMode = mode;
  document.querySelectorAll('.sort-chip2').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  loadUploadFileList(mode);
}

async function deleteFileUpload(id) {
  const res  = await apiFetch(`/api/files/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('🗑️ File removed.', 'warn'); loadUploadFileList(); }
  else showToast(data.message, 'error');
}

// ── Settings ───────────────────────────────────────────────────────────────────
async function saveName() {
  const v = document.getElementById('editNameInput').value.trim();
  if (!v) return;
  const res  = await apiFetch('/api/user', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:v }) });
  const data = await res.json();
  if (data.success) {
    document.getElementById('userName').textContent     = v;
    document.getElementById('userAvatar').textContent   = v[0].toUpperCase();
    document.getElementById('greetName').textContent    = v;
    document.getElementById('settingsName').textContent = v;
    closeModal('editName'); showToast('✅ Name updated!', 'success');
  }
}

async function saveEmail() {
  const v = document.getElementById('editEmailInput').value.trim();
  if (!v) return;
  const res  = await apiFetch('/api/user', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:v }) });
  const data = await res.json();
  if (data.success) {
    document.getElementById('userEmail').textContent     = v;
    document.getElementById('settingsEmail').textContent = v;
    closeModal('editEmail'); showToast('✅ Email updated!', 'success');
  }
}

async function deleteAllFiles() {
  if (!confirm('Delete ALL files permanently? This cannot be undone.')) return;
  const res   = await apiFetch('/api/files');
  const files = await res.json();
  for (const f of files) await apiFetch(`/api/files/${f.id}`, { method:'DELETE' });
  showToast('🗑️ All files deleted.', 'warn');
}

async function deleteAccount() {
  if (!confirm('Delete your account and all data permanently?')) return;
  const res  = await apiFetch('/api/user/delete', { method:'DELETE' });
  const data = await res.json();
  if (data.success) window.location.href = '/';
}

// ── AI Toggle ──────────────────────────────────────────────────────────────────
let aiEnabled = localStorage.getItem('aiEnabled') !== 'false';

function toggleAI() {
  aiEnabled = !aiEnabled;
  localStorage.setItem('aiEnabled', aiEnabled);
  document.getElementById('ai-toggle').classList.toggle('on', aiEnabled);
  showToast(aiEnabled ? '✨ AI suggestions enabled.' : '🔕 AI suggestions disabled.', aiEnabled ? 'success' : 'warn');
}



// ── Create Folder Modal ────────────────────────────────────────────────────────
let cfModalColor = COLOR_OPTIONS[0];

function openCreateFolderModal() {
  document.getElementById('cf-name').value  = '';
  document.getElementById('cf-emoji').value = '📁';
  cfModalColor = COLOR_OPTIONS[0];
  buildColorPicker('cf-colorPicker', c => { cfModalColor = c; });
  openModal('createFolder');
}

async function submitCreateFolder() {
  const name  = document.getElementById('cf-name').value.trim();
  const emoji = document.getElementById('cf-emoji').value.trim() || '📁';
  if (!name) { showToast('Please enter a folder name.', 'warn'); return; }
  const res  = await apiFetch('/api/folders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, emoji, color:cfModalColor.val, bg:cfModalColor.bg }) });
  const data = await res.json();
  if (data.success) { closeModal('createFolder'); showToast('📁 Folder created!', 'success'); await loadFolders(); }
  else showToast(data.message, 'error');
}

function openRenameModal(id, name, emoji) {
  document.getElementById('rf-id').value    = id;
  document.getElementById('rf-name').value  = name;
  document.getElementById('rf-emoji').value = emoji;
  openModal('renameFolder');
}

async function submitRenameFolder() {
  const id    = document.getElementById('rf-id').value;
  const name  = document.getElementById('rf-name').value.trim();
  const emoji = document.getElementById('rf-emoji').value.trim() || '📁';
  if (!name) { showToast('Please enter a folder name.', 'warn'); return; }
  const res  = await apiFetch(`/api/folders/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, emoji }) });
  const data = await res.json();
  if (data.success) { closeModal('renameFolder'); showToast('✅ Folder renamed!', 'success'); await loadFolders(); }
  else showToast(data.message, 'error');
}

// ── Global Search ──────────────────────────────────────────────────────────────
let searchDebounce;
function onGlobalSearch(val) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const active = document.querySelector('.page.active');
    if (active && active.id === 'page-files') loadAllFiles(val);
  }, 300);
}

// ── Modals ─────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById('modal-' + id).classList.add('open'); }
function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open'); }

// ── Utility ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Init ───────────────────────────────────────────────────────────────────────
(async function init() {
  await loadDashboard();
  await apiFetch('/api/folders').then(r => r.json()).then(d => { allFolders = d; });
})();
