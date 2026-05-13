// ── Statistics ─────────────────────────────────────────────────────────────────
async function loadStats() {
  setStatsLoading();
  const [statsRes, chartRes, filesRes] = await Promise.all([
    fetch('/api/stats'), fetch('/api/stats/chart'), fetch('/api/files'),
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
          <div class="chart-bar-label">${folderIconHtml(d.emoji, 'chart-folder-icon')} ${escHtml(d.name)}</div>
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
        const color=extColors[ext]||'#b09e94', icon=getExtIcon(`file.${ext}`);
        return `<div class="chart-bar-row">
          <div class="chart-bar-label">${icon} ${ext.toUpperCase()}</div>
          <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.max(4,(count/maxExt)*100)}%;background:${color};">${count>0?count:''}</div></div>
          <div class="chart-count">${count}</div>
        </div>`;}).join('')
    : `<div class="empty-state"><div class="es-text">No data yet.</div></div>`;
}

function setStatsLoading() {
  const folderBars = document.getElementById('folderChartBars');
  const typeBars = document.getElementById('typeChartBars');
  if (folderBars) folderBars.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
  if (typeBars) typeBars.innerHTML = '<div class="stats-loading"><div class="spinner"></div></div>';
  ['statTotal', 'statAI', 'statManual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="spinner"></span>';
  });
}
