// function showToast(msg, type = 'info') {
//   const wrap = document.getElementById('toastContainer');
//   if (!wrap) return;
//   const t = document.createElement('div');
//   t.className = `toast ${type}`;
//   t.textContent = msg;
//   wrap.appendChild(t);
//   setTimeout(() => {
//     t.classList.add('out');
//     setTimeout(() => t.remove(), 300);
//   }, 3200);
// }

function playToastSound(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const soundMap = {
      success: { freq: 880, type: 'sine',     duration: 0.15 },
      error:   { freq: 220, type: 'sawtooth', duration: 0.25 },
      warn:    { freq: 440, type: 'sine',     duration: 0.2  },
      info:    { freq: 660, type: 'sine',     duration: 0.12 },
    };

    const s = soundMap[type] || soundMap.info;
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + s.duration);
  } catch (_) {}
}

function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastContainer');
  if (!wrap) return;

  playToastSound(type);

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}
