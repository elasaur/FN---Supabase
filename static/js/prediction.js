// ── Prediction Card ────────────────────────────────────────────────────────────
function showPredictionCard(file, analysis) {
  document.getElementById('predFileIcon').innerHTML = getExtIcon(file.name);
  document.getElementById('predFileName').textContent = file.name;
  document.getElementById('predFileMeta').textContent =
    `${getExt(file.name).toUpperCase()} · ${formatSize(file.size)} · Uploaded just now`;

  // Keyword chips
  const kwRow   = document.getElementById('keywordsRow');
  kwRow.innerHTML = `
    <span class="kw-label">
      <img src="https://img.icons8.com/pulsar-color/48/key.png"
          alt="Key Icon"
          class="kw-icon">
      Keywords detected:
    </span>
  `;
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
    const rankLabels  = [
      '<img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/medal2.png" alt=""> Best Match',
      '<img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/medal-second-place.png" alt=""> 2nd Match',
      '<img class="ui-icon ui-icon-sm" src="https://img.icons8.com/pulsar-color/48/medal2-third-place.png" alt=""> 3rd Match'
    ];
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
          <span class="rec-emoji">${folderIconHtml(r.emoji, 'rec-folder-icon')}</span>
          <span class="rec-name">${escHtml(r.folder)}${newBadge}</span>
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
    const top = ranked[0];
    showToast(`Best match: ${top.emoji} ${top.folder}${top.is_new ? ' (new folder)' : ''}`, 'info');
  } else {
    showToast('No match found. Please pick a folder manually.', 'warn');
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
    btn.innerHTML = `${folderIconHtml(f.emoji, 'folder-option-icon')} ${escHtml(f.name)}`;
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
    const emojiInput = document.getElementById('nfEmoji');
    if (emojiInput) emojiInput.value = '📁';
    pickedEmoji = '📁';
    buildColorPicker('colorPicker', c => { cfPickedColor = c; });
  } else {
    panel.classList.remove('show');
  }
}

function buildColorPicker(containerId, onPick, selected) {
  const cp = document.getElementById(containerId);
  if (!cp) return;
  cp.innerHTML = '';
  COLOR_OPTIONS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
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
async function createNewFolder() {
  const btn = window.event?.currentTarget;
  const name = document.getElementById('nfName').value.trim();
  const emoji = document.getElementById('nfEmoji').value.trim() || '📁';
  if (!name) { showToast('Please enter a folder name.', 'warn'); return; }

  let toastMessage = '';
  let toastType = 'success';
  setButtonLoading(btn, true, 'Creating...');
  try {
    const res  = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        emoji,
        color: cfPickedColor.val,
        bg:    cfPickedColor.bg,
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
    selectedFolderObj = { folder:f.name, emoji:f.emoji, color:f.color, bg:f.bg, _db_id:f.id };

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

function updateFolderPreview() {
  const name  = document.getElementById('nfName')?.value  || '';
  const emoji = document.getElementById('nfEmoji')?.value || '📁';
  const color = cfPickedColor?.val || COLOR_OPTIONS[0].val;

  // If you have a live preview element in the panel, update it
  const previewName  = document.getElementById('nf-previewName');
  const previewEmoji = document.getElementById('nf-previewEmoji');
  const previewCard  = document.getElementById('nf-previewCard');

  if (previewName)  previewName.textContent = name || 'Folder Name';
  if (previewEmoji) previewEmoji.textContent = emoji;
  if (previewCard)  previewCard.style.setProperty('--folder-color', color);
}
