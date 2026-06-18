// Statistics
let activeTypeSegment = null;
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

async function loadStats() {
  if (hasAuthenticatedAppData()) {
    renderStatsFromCache();
    syncCachesSilently();
    return;
  }

  setStatsLoading();
  await fetchFreshAuthenticatedAppData();
}

function formatStorageRemaining(bytes, usedBytes) {
  if (!usedBytes) return formatSize(bytes);
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} GB`;
  }
  return formatSize(bytes);
}

function formatStorageUsed(bytes) {
  return Number(bytes || 0) === 0 ? '0' : formatSize(bytes);
}

function renderStorageUsage(storage) {
  const el = document.getElementById('storageUsageSummary');
  const files = Array.isArray(storage) ? storage : allFiles;
  const usedBytes = Array.isArray(storage)
    ? files.reduce((sum, file) => sum + Number(file.file_size || 0), 0)
    : Number(storage.storage_used_bytes || 0);
  const limitBytes = Array.isArray(storage)
    ? STORAGE_LIMIT_BYTES
    : Number(storage.storage_limit_bytes || STORAGE_LIMIT_BYTES);
  const remainingBytes = Array.isArray(storage)
    ? Math.max(limitBytes - usedBytes, 0)
    : Number(storage.storage_remaining_bytes ?? Math.max(limitBytes - usedBytes, 0));
  const pct = limitBytes ? (usedBytes / limitBytes) * 100 : 0;
  const displayPct = Math.min(pct, 100);
  const roundedPct = pct < 0.1 && usedBytes > 0 ? '<0.1' : Math.min(pct, 100).toFixed(1).replace(/\.0$/, '');
  const isNearLimit = pct >= 90;
  const isFull = pct >= 100;

  renderSidebarStorage({
    usedBytes,
    limitBytes,
    displayPct,
    roundedPct,
    isNearLimit,
    isFull,
  });

  if (el) {
    el.innerHTML = `
      <div class="storage-summary">
        <div>
          <div class="storage-kicker">Default storage</div>
          <div class="storage-value">${formatStorageUsed(usedBytes)} <span>used of ${formatSize(limitBytes)}</span></div>
        </div>
        <div class="storage-percent ${isFull ? 'is-full' : isNearLimit ? 'is-near' : ''}">${roundedPct}%</div>
      </div>
      <div class="storage-track" title="${formatStorageUsed(usedBytes)} used of ${formatSize(limitBytes)}">
        <div class="storage-fill ${isFull ? 'is-full' : isNearLimit ? 'is-near' : ''}" style="width:${displayPct}%;"></div>
      </div>
      <div class="storage-meta">
        <span>${formatStorageRemaining(remainingBytes, usedBytes)} remaining</span>
        <span>${files.length} file${files.length === 1 ? '' : 's'} uploaded</span>
      </div>`;
  }
}

function renderSidebarStorage(storage) {
  const fill = document.getElementById('sidebarStorageFill');
  const pctEl = document.getElementById('sidebarStoragePercent');
  const meta = document.getElementById('sidebarStorageMeta');
  if (!fill || !pctEl || !meta) return;

  const usedBytes = Number(storage?.usedBytes ?? storage?.storage_used_bytes ?? 0);
  const limitBytes = Number(storage?.limitBytes ?? storage?.storage_limit_bytes ?? STORAGE_LIMIT_BYTES);
  const pct = limitBytes ? (usedBytes / limitBytes) * 100 : 0;
  const displayPct = Number(storage?.displayPct ?? Math.min(pct, 100));
  const roundedPct = storage?.roundedPct ?? (pct < 0.1 && usedBytes > 0 ? '<0.1' : Math.min(pct, 100).toFixed(1).replace(/\.0$/, ''));
  const isNearLimit = Boolean(storage?.isNearLimit ?? pct >= 90);
  const isFull = Boolean(storage?.isFull ?? pct >= 100);

  pctEl.textContent = `${roundedPct}%`;
  fill.style.width = `${displayPct}%`;
  fill.classList.toggle('is-near', isNearLimit && !isFull);
  fill.classList.toggle('is-full', isFull);
  meta.textContent = `${formatStorageUsed(usedBytes)} used of ${formatSize(limitBytes)}`;
}

function renderFolderBars(chartData) {
  const maxCount = chartData.length ? Math.max(...chartData.map(d => d.count), 1) : 1;
  const folderBars = document.getElementById('folderChartBars');
  if (!folderBars) return;

  folderBars.innerHTML = chartData.length
    ? chartData.map(d => `
        <div class="chart-bar-row" title="${escHtml(d.name)}: ${d.count} file${d.count === 1 ? '' : 's'}">
          <div class="chart-bar-label">${folderIconHtml(d.emoji, 'chart-folder-icon')} ${escHtml(d.name)}</div>
          <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.max(4, (d.count / maxCount) * 100)}%;background:${d.color};">${d.count > 0 ? d.count : ''}</div></div>
          <div class="chart-count">${d.count}</div>
        </div>`).join('')
    : `<div class="empty-state"><div class="es-icon">${filledSvgIcon('statistics.svg', 'empty-svg-icon')}</div><div class="es-text">No data yet.</div></div>`;
}

function renderTypeDonut(files) {
  const extCount = {};
  const extColors = {
    pdf: '#e87a7a',
    docx: '#7ec8e3',
    xlsx: '#7ecfb3',
    jpg: '#9b87d4',
    jpeg: '#9b87d4',
    png: '#b08adf',
    mp3: '#f5a7c7',
    mp4: '#6fb4d6',
    txt: '#b09e94',
    pptx: '#e8855a',
    zip: '#e8b84b',
    csv: '#52b788',
    other: '#9b928c',
  };

  files.forEach(f => {
    const ext = getExt(f.original_name) || 'other';
    extCount[ext] = (extCount[ext] || 0) + 1;
  });

  const extSorted = Object.entries(extCount).sort((a, b) => b[1] - a[1]);
  const wrap = document.getElementById('typeDonutChart');
  if (!wrap) return;

  if (!extSorted.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="es-icon">${filledSvgIcon('donut-chart.svg', 'empty-svg-icon')}</div><div class="es-text">No data yet.</div></div>`;
    return;
  }

  const total = extSorted.reduce((sum, [, count]) => sum + count, 0);
  const visible = extSorted.slice(0, 7);
  const hiddenCount = extSorted.slice(7).reduce((sum, [, count]) => sum + count, 0);
  const segments = hiddenCount ? [...visible, ['other', hiddenCount]] : visible;
  let cursor = 0;

  const gradientStops = segments.map(([ext, count]) => {
    const color = extColors[ext] || extColors.other;
    const start = cursor;
    const end = cursor + (count / total) * 360;
    cursor = end;
    return `${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  }).join(', ');

  const initialExt = activeTypeSegment && segments.some(([ext]) => ext === activeTypeSegment)
    ? activeTypeSegment
    : segments[0][0];
  const initial = segments.find(([ext]) => ext === initialExt) || segments[0];
  const initialPercent = Math.round((initial[1] / total) * 100);

  wrap.innerHTML = `
    <div class="donut-layout">
      <button class="donut-chart" type="button" style="--donut-gradient:conic-gradient(${gradientStops});" aria-label="File type breakdown">
        <span class="donut-center">
          <span class="donut-center-value" style="color: var(--accent);">${total}</span>
          <span class="donut-center-label">Total files</span>
        </span>
      </button>
      <div class="donut-legend">
        ${segments.map(([ext, count]) => {
          const color = extColors[ext] || extColors.other;
          const pct = Math.round((count / total) * 100);
          const label = ext === 'other' && hiddenCount ? 'Other' : ext.toUpperCase();
          return `
            <button class="donut-legend-item${ext === initial[0] ? ' active' : ''}" type="button" style="--legend-color:${color};" data-ext="${escHtml(ext)}" data-count="${count}" data-pct="${pct}" onclick="selectTypeSegment(this)">
              <span class="donut-swatch"></span>
              <span class="donut-label">${ext === 'other' && hiddenCount ? '' : getExtIcon(`file.${ext}`)}<span class="donut-label-text">${escHtml(label)}</span></span>
              <span class="donut-count">${count}</span>
            </button>`;
        }).join('')}
      </div>
    </div>
    <div class="donut-detail" id="typeDonutDetail">
      <strong>${escHtml(initial[0] === 'other' && hiddenCount ? 'Other' : initial[0].toUpperCase())}</strong>
      accounts for <strong>${initialPercent}%</strong> of files (${initial[1]}).
    </div>`;
}

function selectTypeSegment(btn) {
  const wrap = document.getElementById('typeDonutChart');
  const detail = document.getElementById('typeDonutDetail');
  if (!wrap || !detail || !btn) return;

  wrap.querySelectorAll('.donut-legend-item').forEach(item => item.classList.remove('active'));
  btn.classList.add('active');

  const ext = btn.dataset.ext || 'Other';
  const label = ext === 'other' ? 'Other' : ext.toUpperCase();
  activeTypeSegment = ext;
  detail.innerHTML = `<strong>${escHtml(label)}</strong> accounts for <strong>${btn.dataset.pct}%</strong> of files (${btn.dataset.count}).`;
}

function renderAiSortingSummary(stats) {
  const total = Number(stats.total_files || 0);
  const accepted = Number(stats.ai_suggestions_accepted ?? stats.ai_sorted ?? 0);
  const manual = Math.max(total - accepted, 0);
  const aiPct = total ? Math.round((accepted / total) * 100) : 0;
  const summary = document.getElementById('aiSortingSummary');
  if (!summary) return;

  summary.innerHTML = `
    <div class="ai-summary-meter">
      <div>
        <div class="ai-summary-kicker">AI suggestions accepted</div>
        <div class="ai-summary-value">${aiPct}%</div>
      </div>
    </div>
    <div class="ai-summary-track" title="${accepted} of ${total} uploads followed the AI recommendation">
      <div class="ai-summary-fill" style="width:${aiPct}%;"></div>
    </div>
    <div class="ai-summary-tiles">
      <div class="ai-summary-tile" style="--tile-color:var(--accent);">
        <div class="ai-summary-label">Total Uploads</div>
        <div class="ai-summary-count" id="statTotal">${total}</div>
      </div>
      <div class="ai-summary-tile" style="--tile-color:var(--mint);">
        <div class="ai-summary-label">AI Suggestions Accepted</div>
        <div class="ai-summary-count" id="statAI">${accepted}</div>
      </div>
      <div class="ai-summary-tile" style="--tile-color:var(--yellow);">
        <div class="ai-summary-label">Manual Choices</div>
        <div class="ai-summary-count" id="statManual">${manual}</div>
      </div>
    </div>`;
}

function setStatsLoading() {
  const folderBars = document.getElementById('folderChartBars');
  const typeDonut = document.getElementById('typeDonutChart');
  const aiSummary = document.getElementById('aiSortingSummary');
  const storageSummary = document.getElementById('storageUsageSummary');
  if (folderBars) folderBars.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
  if (typeDonut) typeDonut.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
  if (aiSummary) aiSummary.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
  if (storageSummary) storageSummary.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
}
