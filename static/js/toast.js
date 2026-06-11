let toastAudioContext = null;
let toastAudioUnlocked = false;

function getToastAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!toastAudioContext) toastAudioContext = new AudioCtx();
  if (toastAudioContext.state === 'suspended') {
    toastAudioContext.resume().catch(() => {});
  }
  return toastAudioContext;
}

function unlockToastAudio() {
  if (toastAudioUnlocked) return;
  const ctx = getToastAudioContext();
  if (!ctx) return;
  toastAudioUnlocked = true;
}

document.addEventListener('pointerdown', unlockToastAudio, { once: true, passive: true });
document.addEventListener('keydown', unlockToastAudio, { once: true });

function playToastSound(type) {
  try {
    const ctx = getToastAudioContext();
    if (!ctx) return;
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
    const now = ctx.currentTime;
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.freq, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + s.duration);

    osc.start(now);
    osc.stop(now + s.duration);
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

function getToastContainer() {
  let wrap = document.getElementById('toastContainer');
  if (wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'toastContainer';
  wrap.className = 'toast-container';
  document.body.appendChild(wrap);
  return wrap;
}

function showToast(msg, type = 'info') {
  const wrap = getToastContainer();
  const toastType = getToastType(type);
  const message = getToastMessage(msg);

  playToastSound(toastType);

  const t = document.createElement('div');
  t.className = `toast ${toastType}`;
  t.textContent = message;
  t.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
  t.setAttribute('aria-live', toastType === 'error' ? 'assertive' : 'polite');
  wrap.appendChild(t);

  if (wrap.children.length > 4) wrap.firstElementChild?.remove();

  window.setTimeout(() => {
    t.classList.add('out');
    window.setTimeout(() => t.remove(), 220);
  }, 3200);
}
