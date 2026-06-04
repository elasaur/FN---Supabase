// static/js/utils.js

const buttonOriginalHtml = new WeakMap();

function getExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function localIcon(file) {
  const iconName = String(file).split('/').pop();
  return typeof iconPackPath === 'function'
    ? iconPackPath(iconName)
    : `/icons-pack/${encodeURIComponent(iconName)}`;
}

function getExtIcon(name) {
  const icons = {
    xml: [localIcon('icons8-docs-48.png'), 'xml-file'],
    css: [localIcon('icons8-docs-48.png'), 'css-file'],
    json: [localIcon('icons8-docs-48.png'), 'json-file'],
    html: [localIcon('icons8-docs-48.png'), 'html-file'],
    htm: [localIcon('icons8-docs-48.png'), 'html-file'],
    csv: [localIcon('icons8-csv-48.png'), 'csv'],
    xls: [localIcon('icons8-spreadsheet-file-48.png'), 'spreadsheet'],
    xlsx: [localIcon('icons8-spreadsheet-file-48.png'), 'spreadsheet'],
    doc: [localIcon('icons8-docs-48.png'), 'document'],
    docx: [localIcon('icons8-docs-48.png'), 'document'],
    pdf: [localIcon('icons8-pdf-48.png'), 'pdf'],
    ppt: [localIcon('icons8-ppt-48.png'), 'presentation'],
    pptx: [localIcon('icons8-ppt-48.png'), 'presentation'],
    txt: [localIcon('icons8-txt-48.png'), 'text-file'],
    jpg: [localIcon('icons8-image-48.png'), 'image'],
    jpeg: [localIcon('icons8-image-48.png'), 'image'],
    heic: [localIcon('icons8-image-48.png'), 'image'],
    mkv: [localIcon('icons8-video-file-48.png'), 'video'],
    mp4: [localIcon('icons8-video-file-48.png'), 'video'],
    avi: [localIcon('icons8-video-file-48.png'), 'video'],
    png: [localIcon('icons8-image-48.png'), 'image'],
    gif: [localIcon('icons8-image-48.png'), 'image'],
    wav: [localIcon('icons8-audio-file-48.png'), 'audio'],
    mp3: [localIcon('icons8-audio-file-48.png'), 'audio'],
    ttf: [localIcon('icons8-docs-48.png'), 'font-file'],
    rar: [localIcon('icons8-archive-folder-48.png'), 'archive'],
    zip: [localIcon('icons8-archive-folder-48.png'), 'archive'],
  };
  const [src, alt] = icons[getExt(name)] || [localIcon('icons8-docs-48.png'), 'file'];
  return `<img class="file-type-icon" width="48" height="48" src="${src}" alt="${alt}" loading="lazy">`;
}

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
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Could not open file.', 'error');
      return;
    }
    window.open(data.url, '_blank', 'noopener');
  } catch (err) {
    showToast('Could not open file. Please try again.', 'error');
  }
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
