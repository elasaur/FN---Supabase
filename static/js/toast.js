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

const TOAST_TYPES = new Set(['success', 'error', 'warn', 'info']);
const TOAST_TYPE_ALIASES = {
  warning: 'warn',
  danger: 'error',
  fail: 'error',
  failed: 'error',
  failure: 'error',
};

function getToastMessage(msg) {
  if (typeof msg === 'string') return msg.trim() || 'Something happened.';
  if (msg && typeof msg.message === 'string') return msg.message.trim() || 'Something happened.';
  if (msg == null) return 'Something happened.';
  return String(msg).trim() || 'Something happened.';
}

function getToastType(type) {
  const normalized = String(type || 'info').toLowerCase();
  const aliased = TOAST_TYPE_ALIASES[normalized] || normalized;
  return TOAST_TYPES.has(aliased) ? aliased : 'info';
}

function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastContainer');
  if (!wrap) return;

  const toastType = getToastType(type);
  const message = getToastMessage(msg);

  const t = document.createElement('div');
  t.className = `toast ${toastType}`;
  t.textContent = message;
  t.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
  t.setAttribute('aria-live', toastType === 'error' ? 'assertive' : 'polite');
  wrap.appendChild(t);

  if (wrap.children.length > 4) wrap.firstElementChild?.remove();

  window.requestAnimationFrame(() => playToastSound(toastType));

  window.setTimeout(() => {
    t.classList.add('out');
    window.setTimeout(() => t.remove(), 220);
  }, 3200);
}
