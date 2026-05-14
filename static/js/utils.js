// static/js/utils.js

function getExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function getExtIcon(name) {
  const icons = {
    xml: ['https://img.icons8.com/fluency/48/xml-file.png', 'xml-file'],
    css: ['https://img.icons8.com/fluency/48/css-filetype.png', 'css-filetype'],
    json: ['https://img.icons8.com/fluency/48/json.png', 'json'],
    html: ['https://img.icons8.com/fluency/48/html-filetype.png', 'html-filetype'],
    htm: ['https://img.icons8.com/fluency/48/html-filetype.png', 'html-filetype'],
    csv: ['https://img.icons8.com/fluency/48/csv.png', 'csv'],
    xls: ['https://img.icons8.com/pulsar-color/48/xls.png', 'xls'],
    xlsx: ['https://img.icons8.com/pulsar-color/48/xls.png', 'xls'],
    doc: ['https://img.icons8.com/pulsar-color/48/doc.png', 'doc'],
    docx: ['https://img.icons8.com/pulsar-color/48/doc.png', 'doc'],
    pdf: ['https://img.icons8.com/pulsar-color/48/pdf--v2.png', 'pdf'],
    ppt: ['https://img.icons8.com/pulsar-color/48/ppt.png', 'ppt'],
    pptx: ['https://img.icons8.com/pulsar-color/48/ppt.png', 'ppt'],
    txt: ['https://img.icons8.com/pulsar-color/48/txt.png', 'txt'],
    jpg: ['https://img.icons8.com/pulsar-color/48/jpg.png', 'jpg'],
    jpeg: ['https://img.icons8.com/pulsar-color/48/jpg.png', 'jpg'],
    heic: ['https://img.icons8.com/pulsar-color/48/heic.png', 'heic'],
    mkv: ['https://img.icons8.com/pulsar-color/48/mkv.png', 'mkv'],
    mp4: ['https://img.icons8.com/pulsar-color/48/mkv.png', 'mkv'],
    avi: ['https://img.icons8.com/pulsar-color/48/mkv.png', 'mkv'],
    png: ['https://img.icons8.com/pulsar-color/48/png.png', 'png'],
    gif: ['https://img.icons8.com/fluency/48/image-file.png', 'image-file'],
    wav: ['https://img.icons8.com/fluency/48/wav.png', 'wav'],
    mp3: ['https://img.icons8.com/pulsar-color/48/mp3.png', 'mp3'],
    ttf: ['https://img.icons8.com/pulsar-color/48/ttf.png', 'ttf'],
    rar: ['https://img.icons8.com/pulsar-color/48/rar.png', 'rar'],
    zip: ['https://img.icons8.com/pulsar-color/48/zip.png', 'zip'],
  };
  const [src, alt] = icons[getExt(name)] || ['https://img.icons8.com/fluency/48/image-file.png', 'image-file'];
  return `<img class="file-type-icon" width="48" height="48" src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`;
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
  return /^https:\/\/img\.icons8\.com\/pulsar-color\/48\/[-a-z0-9]+\.png$/i.test(String(value || ''));
}

function folderIconUrlForName(name) {
  const text = String(name || '').toLowerCase();
  const picks = [
    [['love', 'heart', 'family', 'personal'], 'hearts.png'],
    [['flower', 'garden', 'art', 'design'], 'flower.png'],
    [['star', 'favorite', 'important'], 'star.png'],
    [['goal', 'target', 'plan'], 'goal.png'],
    [['school', 'class', 'study', 'student'], 'graduation-cap.png'],
    [['travel', 'trip', 'vacation'], 'trave-diary.png'],
    [['code', 'dev', 'program', 'project'], 'code.png'],
    [['nature', 'plant', 'eco'], 'leaf.png'],
    [['science', 'lab', 'research'], 'acid-flask.png'],
    [['shopping', 'shop', 'receipt', 'purchase'], 'shopaholic.png'],
    [['work', 'business', 'office'], 'business.png'],
    [['food', 'recipe', 'meal'], 'salmon-sushi.png'],
    [['birthday', 'party', 'event'], 'birthday-cake.png'],
    [['book', 'read', 'library'], 'book.png'],
    [['note', 'journal'], 'moleskine.png'],
    [['computer', 'tech'], 'my-computer.png'],
  ];
  const match = picks.find(([words]) => words.some(word => text.includes(word)));
  const file = match ? match[1] : SYSTEM_FOLDER_ICONS[Math.abs(hashString(text)) % SYSTEM_FOLDER_ICONS.length].value.split('/').pop();
  return `https://img.icons8.com/pulsar-color/48/${file}`;
}

function hashString(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function folderIconHtml(value, className) {
  let icon = value || '📁';
  if (isIconUrl(icon)) {
    icon = '📁';
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
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<span class="btn-spinner"></span><span>${label || 'Loading...'}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
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
