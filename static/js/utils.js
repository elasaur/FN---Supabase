// static/js/utils.js

const buttonOriginalHtml = new WeakMap();

function getExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function localIcon(file) {
  const iconPath = String(file)
    .replace(/^\/?icons-pack\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return typeof iconPackPath === 'function'
    ? iconPackPath(iconPath)
    : `/icons-pack/${iconPath}`;
}

function svgIcon(file, className = '', label = '') {
  const src = localIcon(`custom-svg/${file}`);
  const aria = label
    ? `role="img" aria-label="${escHtml(label)}"`
    : 'aria-hidden="true"';
  return `<span class="svg-icon ${className}" style="--svg-icon: url('${src}');" ${aria}></span>`;
}

function filledSvgIcon(file, className = '', label = '') {
  const filledFiles = {
    'dash-ai.svg': 'ai.svg',
    'dash-calendar.svg': 'calendar.svg',
    'dash-file.svg': 'file.svg',
    'dash-folder.svg': 'dash-folder.svg',
    'donut-chart.svg': 'pie-chart.svg',
    'pin-folder.svg': 'pin-folder.svg',
    'search.svg': 'search.svg',
    'session-timeout.svg': 'warning.svg',
    'statistics.svg': 'statistics.svg',
    'storage.svg': 'storage.svg',
    'textblob-logo.svg': 'textblob-logo.svg',
    'upload.svg': 'upload.svg',
    'warning.svg': 'warning.svg',
    'file.svg': 'file.svg',
    'folder.svg': 'dash-folder.svg',
    'keyword.svg': 'keyword.svg',
    'edit.svg': 'edit.svg',
    'sticky-note.svg': 'sticky-note.svg',
  };
  const src = localIcon(`custom-svg/filled/${filledFiles[file] || file}`);
  const aria = label
    ? `role="img" aria-label="${escHtml(label)}"`
    : 'aria-hidden="true"';
  return `<span class="svg-icon filled-svg-icon ${className}" style="--svg-icon: url('${src}');" ${aria}></span>`;
}

function getExtIcon(name) {
  const icons = {
    xml: ['005-txt.png', 'xml-file', '#fef7dd'],
    css: ['005-txt.png', 'css-file', '#fef7dd'],
    json: ['005-txt.png', 'json-file', '#fef7dd'],
    html: ['005-txt.png', 'html-file', '#fef7dd'],
    htm: ['005-txt.png', 'html-file', '#fef7dd'],
    csv: ['004-csv.png', 'csv', '#d9f5ec'],
    xls: ['001-xls.png', 'spreadsheet', '#d9f5ec'],
    xlsx: ['001-xls.png', 'spreadsheet', '#d9f5ec'],
    doc: ['012-doc.png', 'document', '#e0f4fb'],
    docx: ['009-docx.png', 'document', '#e0f4fb'],
    pdf: ['011-pdf.png', 'pdf', '#fde8e8'],
    ppt: ['006-ppt.png', 'presentation', '#fde8de'],
    pptx: ['006-ppt.png', 'presentation', '#fde8de'],
    txt: ['005-txt.png', 'text-file', '#fef7dd'],
    jpg: ['010-jpg.png', 'image', '#fce8f3'],
    jpeg: ['010-jpg.png', 'image', '#fce8f3'],
    heic: ['010-jpg.png', 'image', '#fce8f3'],
    png: ['007-png.png', 'image', '#fce8f3'],
    gif: ['007-png.png', 'image', '#fce8f3'],
    mkv: ['003-mp4.png', 'video', '#ede8f8'],
    mp4: ['003-mp4.png', 'video', '#ede8f8'],
    avi: ['003-mp4.png', 'video', '#ede8f8'],
    wav: ['002-mp3.png', 'audio', '#ede8f8'],
    mp3: ['002-mp3.png', 'audio', '#ede8f8'],
    ttf: ['005-txt.png', 'font-file', '#fef7dd'],
    rar: ['008-zip.png', 'archive', '#f0f0f0'],
    zip: ['008-zip.png', 'archive', '#f0f0f0'],
  };
  const ext = getExt(name);
  const [file, alt, bg] = icons[ext] || ['005-txt.png', 'file', '#f7f4f0'];
  const src = localIcon(file);
  return `<span class="file-type-icon file-type-tile" style="--file-type-bg:${bg};"><img class="file-type-img" src="${src}" alt="${alt}" loading="lazy"></span>`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function parseAppDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr);
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
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

function isNewFile(dateStr) {
  const createdAt = parseAppDate(dateStr);
  return Boolean(createdAt && (Date.now() - createdAt.getTime()) < 24 * 3600 * 1000);
}

function newFileBadge(dateStr) {
  return isNewFile(dateStr) ? ' <span class="new-badge">NEW</span>' : '';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function summaryWords(text, maxWords = 200) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function fileSummaryText(file) {
  const summary = summaryWords(file?.ai_summary || file?.summary || '');
  return summary || 'No AI summary saved for this file.';
}

function fileSummaryButton(file) {
  const encoded = encodeURIComponent(JSON.stringify({
    id: file?.id,
    name: file?.original_name || 'File',
    summary: fileSummaryText(file),
  }));
  return `
    <button type="button" class="file-summary-note-btn"
      data-summary-file="${escHtml(encoded)}"
      onmouseenter="showFileSummaryNote(event, this)"
      onfocus="showFileSummaryNote(event, this)"
      onmouseleave="scheduleFileSummaryNoteClose()"
      onblur="scheduleFileSummaryNoteClose()"
      onclick="event.stopPropagation();showFileSummaryNote(event, this)"
      title="View AI summary"
      aria-label="View AI summary for ${escHtml(file?.original_name || 'file')}">
      ${filledSvgIcon('sticky-note.svg', 'file-summary-note-icon')}
    </button>
  `;
}

let fileSummaryNoteCloseTimer = null;

function ensureFileSummaryNote() {
  let note = document.getElementById('fileSummaryHoverNote');
  if (note) return note;
  note = document.createElement('div');
  note.id = 'fileSummaryHoverNote';
  note.className = 'file-summary-hover-note';
  note.onmouseenter = () => clearTimeout(fileSummaryNoteCloseTimer);
  note.onmouseleave = scheduleFileSummaryNoteClose;
  document.body.appendChild(note);
  return note;
}

function showFileSummaryNote(event, button) {
  event?.stopPropagation?.();
  clearTimeout(fileSummaryNoteCloseTimer);
  const raw = button?.dataset?.summaryFile || '';
  let payload = { name: 'File', summary: 'No AI summary saved for this file.' };
  try {
    payload = JSON.parse(decodeURIComponent(raw));
  } catch (_) {}

  const note = ensureFileSummaryNote();
  const fileId = Number(payload.id) || 0;
  note.innerHTML = `
    <div class="file-summary-note-head">
      <span class="file-summary-note-head-icon">${filledSvgIcon('sticky-note.svg', 'file-summary-note-title-icon')}</span>
      <div class="file-summary-note-title">${escHtml(payload.name || 'File')}</div>
    </div>
    <div class="file-summary-note-body">${escHtml(summaryWords(payload.summary, 200) || 'No AI summary saved for this file.')}</div>
    <div class="file-summary-note-actions">
      <button type="button" class="file-summary-reanalyze-btn"
        ${fileId ? `onclick="reanalyzeFileSummary(event, ${fileId}, this)"` : 'disabled'}>
        Re-analyze Summary
      </button>
    </div>
  `;
  note.classList.add('open');

  const rect = button.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
  let top = rect.bottom + 10;
  note.style.width = `${width}px`;
  note.style.left = `${left}px`;
  note.style.top = `${top}px`;

  const noteRect = note.getBoundingClientRect();
  if (noteRect.bottom > window.innerHeight - 12) {
    top = Math.max(12, rect.top - noteRect.height - 10);
    note.style.top = `${top}px`;
  }
}

function scheduleFileSummaryNoteClose() {
  clearTimeout(fileSummaryNoteCloseTimer);
  fileSummaryNoteCloseTimer = setTimeout(closeFileSummaryNote, 160);
}

function closeFileSummaryNote() {
  document.getElementById('fileSummaryHoverNote')?.classList.remove('open');
}

async function reanalyzeFileSummary(event, fileId, button) {
  event?.stopPropagation?.();
  clearTimeout(fileSummaryNoteCloseTimer);
  const btn = button;
  const originalText = btn?.textContent || 'Re-analyze Summary';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
  }

  try {
    const res = await fetch(`/api/files/${fileId}/reanalyze-summary`, { method: 'POST' });
    const data = await res.json().catch(() => ({ success: false, message: 'Re-analysis failed.' }));
    if (!data.success) {
      if (typeof showToast === 'function') showToast(data.message || 'Re-analysis failed.', 'error');
      return;
    }

    const summary = summaryWords(data.summary || '');
    if (typeof updateCachedFile === 'function') {
      updateCachedFile(fileId, file => { file.ai_summary = summary; });
    }
    if (typeof renderEverywhereFromCache === 'function') renderEverywhereFromCache();

    const note = ensureFileSummaryNote();
    const body = note.querySelector('.file-summary-note-body');
    if (body) body.textContent = summary || 'No AI summary saved for this file.';
    if (typeof showToast === 'function') showToast('Summary re-analyzed.', 'success');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

function isSystemIcon(value) {
  return SYSTEM_FOLDER_ICONS.some(icon => icon.value === String(value || ''));
}

function isIconUrl(value) {
  return /^(?:https:\/\/img\.icons8\.com\/|\/icons-pack\/).+\.png$/i.test(String(value || ''));
}

function folderIconUrlForName(name) {
  const text = String(name || '').toLowerCase();
  const picks = [
    [['image', 'photo', 'design'], 'icons8-image-48.png'],
    [['sheet', 'budget', 'invoice', 'finance'], 'icons8-spreadsheet-file-48.png'],
    [['audio', 'music'], 'icons8-audio-file-48.png'],
    [['video', 'movie'], 'icons8-video-file-48.png'],
    [['archive', 'zip', 'backup'], 'icons8-archive-folder-48.png'],
    [['security', 'private'], 'icons8-cyber-security-50.png'],
    [['profile', 'person', 'account'], 'icons8-profile-48.png'],
    [['database', 'data'], 'icons8-database-50.png'],
    [['report', 'chart', 'stats'], 'icons8-bar-chart-50.png'],
    [['document', 'book', 'read', 'note'], 'icons8-document-50.png'],
  ];
  const match = picks.find(([words]) => words.some(word => text.includes(word)));
  return match ? localIcon(match[1]) : SYSTEM_FOLDER_ICONS[Math.abs(hashString(text)) % SYSTEM_FOLDER_ICONS.length].value;
}

function hashString(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function folderIconHtml(value, className) {
  let icon = value || '📁';
  if (isIconUrl(icon)) {
    return `<img class="ui-icon ${className || ''}" src="${escHtml(icon)}" alt="" loading="lazy">`;
  }
  if (/^[a-z0-9_]+$/.test(String(icon))) {
    return `<span class="material-symbols-rounded ${className || ''}">${escHtml(icon)}</span>`;
  }
  return `<span class="${className || ''}">${escHtml(icon)}</span>`;
}

function buildSystemIconSelect(selectId, selected) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = isSystemIcon(selected) ? selected : DEFAULT_FOLDER_ICON;
  select.innerHTML = SYSTEM_FOLDER_ICONS.map(icon => `
    <option value="${icon.value}" ${icon.value === current ? 'selected' : ''}>${icon.label}</option>
  `).join('');
}

function downloadFile(id, name) {
  window.location.href = `/api/files/${id}/download`;
}

async function openFile(id) {
  try {
    const res = await fetch(`/api/files/${id}/open`, { method: 'POST' });
    const data = await res.json().catch(() => ({
      success: false,
      message: res.ok ? 'Could not open file.' : 'Server returned an invalid response.',
    }));
    if (!data.success) {
      showToast(data.message || 'Could not open file.', 'error');
      return;
    }
    window.open(data.url, '_blank', 'noopener');
  } catch (err) {
    showToast('Could not open file. Please try again.', 'error');
  }
}

function getActionButton(candidate) {
  if (candidate instanceof HTMLElement) return candidate;
  const currentTarget = window.event?.currentTarget;
  if (currentTarget instanceof HTMLElement) return currentTarget;
  return document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
}

function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    if (!buttonOriginalHtml.has(button)) buttonOriginalHtml.set(button, button.innerHTML);
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<span class="btn-spinner"></span><span>${label || 'Loading...'}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (buttonOriginalHtml.has(button)) {
      button.innerHTML = buttonOriginalHtml.get(button);
      buttonOriginalHtml.delete(button);
    }
  }
}

async function withButtonLoading(button, label, task) {
  setButtonLoading(button, true, label);
  try {
    return await task();
  } finally {
    setButtonLoading(button, false);
  }
}
