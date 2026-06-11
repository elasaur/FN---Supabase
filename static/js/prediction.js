// Prediction card feature: render AI folder suggestions and manual choices.
let cfPickedColor = COLOR_OPTIONS[0];

// Shows the prediction card for one analyzed upload.
function showPredictionCard(file, analysis) {
  document.getElementById('predFileIcon').innerHTML = getExtIcon(file.name);
  document.getElementById('predFileName').textContent = file.name;
  document.getElementById('predFileMeta').textContent =
    `${getExt(file.name).toUpperCase()} · ${formatSize(file.size)} · Uploaded just now`;

  // Keyword chips: show extracted terms used by the recommendation.
  const kwRow = document.getElementById('keywordsRow');
  kwRow.innerHTML = `
    <span class="kw-label">
      <span class="upload-tile-icon upload-tile-xs" style="--upload-icon-color:var(--sky); --upload-icon-bg:var(--sky2);">
        ${filledSvgIcon('keyword.svg', 'upload-tile-svg')}
      </span>
      Keywords detected:
    </span>
  `;
  const keywords = analysis.keywords || [];
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

  // Default to the top ranked suggestion when the analyzer returns choices.
  const ranked = analysis.ranked || [];
  selectedFolderObj = ranked.length ? ranked[0] : null;

  const confWrap = document.getElementById('confBarWrap');
  if (confWrap) confWrap.style.display = 'none';

  // Recommendation cards: rank choices and keep the selected folder in state.
  const recList = document.getElementById('recList');
  recList.innerHTML = '';

  if (!ranked.length) {
    const notice = document.createElement('div');
    notice.className = 'prediction-notice';
    notice.textContent = '⚠️ Could not detect folder. Please pick one below or create a new folder.';
    recList.appendChild(notice);
  } else {
    const rankClasses = ['rank-1', 'rank-2', 'rank-3', 'rank-other'];
    const rankColors = ['var(--yellow)', 'var(--sky)', 'var(--mint)'];

    // Render only the top three ranked folder recommendations.
    ranked.slice(0, 3).forEach((r, idx) => {
      const isSelected = idx === 0;
      // Clamp confidence before displaying it in the card badge.
      const confidence = Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0)));
      const card = document.createElement('div');
      card.className = 'rec-card' + (isSelected ? ' selected' : '');
      card.style.setProperty('--rc-color', r.color);
      card.style.setProperty('--rc-bg', r.bg);
      card.style.setProperty('--rank-color', rankColors[idx] || 'var(--accent)');

      const newBadge = r.is_new
        ? `<span style="background:var(--mint);color:#fff;font-size:0.62rem;font-weight:900;padding:2px 7px;border-radius:10px;margin-left:4px;">NEW</span>`
        : '';

      card.innerHTML = `
        <div class="rec-select-check">${isSelected ? '✓' : ''}</div>
        <div class="rec-top">
          <span class="rec-emoji">${folderIconHtml(r.emoji, 'rec-folder-icon')}</span>
          <span class="rec-name">${escHtml(r.folder)}${newBadge}</span>
          <span class="rec-rank-badge ${rankClasses[idx]||'rank-other'}">${confidence}%</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:8px;font-style:italic;">
          ${escHtml(r.reason || '')}
        </div>
        <div class="rec-kws" id="chips-${idx}"></div>`;

      card.onclick = () => {
        // Clear previous selections before marking this recommendation selected.
        document.querySelectorAll('.rec-card').forEach(c => {
          c.classList.remove('selected');
          const chk = c.querySelector('.rec-select-check');
          if (chk) chk.textContent = '';
        });
        document.querySelectorAll('.folder-option').forEach(b => b.classList.remove('selected'));
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
    const top = ranked[0];
    const confidence = Math.max(0, Math.min(100, Math.round(Number(top.confidence) || 0)));
    showToast(`AI suggestion: ${top.folder} (${confidence}%)${top.is_new ? ' (new folder)' : ''}`, 'info');
  } else {
    showToast('No match found. Please pick a folder manually.', 'warn');
  }
}

// Builds manual folder selection buttons from the folder cache.
function buildAllFoldersPicker(analysis) {
  const opts = document.getElementById('folderOptions');
  opts.innerHTML = '';
  document.getElementById('allFoldersWrap').style.display = 'none';
  document.getElementById('showAllBtn').textContent = 'Show all folders ▾';

  allFolders.forEach(f => {
    const btn = document.createElement('button');

    btn.className = 'folder-option';
    btn.style.setProperty('--rc-color', f.color);
    btn.innerHTML = `${folderIconHtml(f.emoji, 'folder-option-icon')} ${escHtml(f.name)}`;

    btn.onclick = () => {
      // Manual folder selection replaces any recommendation selection.
      document.querySelectorAll('.rec-card').forEach(card => {
        card.classList.remove('selected');
        const chk = card.querySelector('.rec-select-check');
        if (chk) chk.textContent = '';
      });
      document.querySelectorAll('.folder-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFolderObj = { folder: f.name, emoji: f.emoji, color: f.color, bg: f.bg, _db_id: f.id };
    };

    opts.appendChild(btn);
  });
}

// Toggles the full manual folder list visibility.
function toggleAllFolders() {
  const wrap = document.getElementById('allFoldersWrap');
  const btn = document.getElementById('showAllBtn');
  if (wrap.style.display === 'none') {
    wrap.style.display = 'block';
    btn.textContent = 'Hide folders ▲';
  } else {
    wrap.style.display = 'none';
    btn.textContent = 'Show all folders ▾';
  }
}

// New folder panel: create a custom destination inside the prediction card.
// Opens or closes the new-folder panel inside the prediction card.
function toggleNewFolder() {
  const panel = document.getElementById('newFolderPanel');
  const isOpen = panel.classList.contains('show');
  if (!isOpen) {
    panel.classList.add('show');
    const emojiInput = document.getElementById('nfEmoji');
    if (emojiInput) emojiInput.value = '📁';
    cfPickedColor = COLOR_OPTIONS[0];
    buildPredictionColorPicker('colorPicker', c => { cfPickedColor = c; });
  } else {
    panel.classList.remove('show');
  }
}

// Builds color options for the prediction-card new-folder panel.
function buildPredictionColorPicker(containerId, onPick, selected) {
  const cp = document.getElementById(containerId);
  if (!cp) return;

  cp.innerHTML = '';

  COLOR_OPTIONS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';

    const active = selected ? selected.val === c.val : i === 0;
    btn.className = 'color-opt' + (active ? ' picked' : '');
    btn.style.background = c.val;

    btn.onclick = () => {
      cp.querySelectorAll('.color-opt').forEach(b => b.classList.remove('picked'));
      btn.classList.add('picked');
      if (onPick) onPick(c);
      updateFolderPreview();
    };
    cp.appendChild(btn);
  });

  if (onPick) onPick(selected || COLOR_OPTIONS[0]);
}

// Called by onclick="createNewFolder()" in the HTML
// Creates a new folder from the prediction card and selects it for upload.
async function createNewFolder() {
  const btn = window.event?.currentTarget;
  const name = document.getElementById('nfName').value.trim();
  const emoji = document.getElementById('nfEmoji').value.trim() || '📁';
  if (!name) { showToast('Please enter a folder name.', 'warn'); return; }

  let toastMessage = '';
  let toastType = 'success';
  setButtonLoading(btn, true, 'Creating...');
  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        emoji,
        color: cfPickedColor.val,
        bg: cfPickedColor.bg,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      toastType = 'error';
      toastMessage = data.message;
      return;
    }

    const f = data.folder;
    allFolders.push(f);
    selectedFolderObj = { folder: f.name, emoji: f.emoji, color: f.color, bg: f.bg, _db_id: f.id };

    document.getElementById('newFolderPanel').classList.remove('show');
    document.getElementById('nfName').value = '';
    document.getElementById('nfEmoji').value = '';
    buildAllFoldersPicker(currentAnalysis || { ranked: [] });
    toastMessage = `Folder "${name}" created and selected!`;
  } finally {
    setButtonLoading(btn, false);
    if (toastMessage) showToast(toastMessage, toastType);
  }
}

// Updates the optional new-folder preview elements when they exist.
function updateFolderPreview() {
  const name = document.getElementById('nfName')?.value || '';
  const emoji = document.getElementById('nfEmoji')?.value || '📁';
  const color = cfPickedColor?.val || COLOR_OPTIONS[0].val;

  // If you have a live preview element in the panel, update it
  const previewName = document.getElementById('nf-previewName');
  const previewEmoji = document.getElementById('nf-previewEmoji');
  const previewCard = document.getElementById('nf-previewCard');

  if (previewName) previewName.textContent = name || 'Folder Name';
  if (previewEmoji) previewEmoji.textContent = emoji;
  if (previewCard) previewCard.style.setProperty('--folder-color', color);
}
