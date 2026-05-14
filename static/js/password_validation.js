const PASSWORD_REQUIREMENTS = [
  { test: value => value.length >= 8, message: 'at least 8 characters' },
  { test: value => /[A-Z]/.test(value), message: 'one uppercase letter' },
  { test: value => /[a-z]/.test(value), message: 'one lowercase letter' },
  { test: value => /\d/.test(value), message: 'one number' },
  { test: value => /[^A-Za-z0-9]/.test(value), message: 'one special character' },
  { test: value => !/\s/.test(value), message: 'no spaces' },
];

function passwordValidationErrors(value) {
  const password = String(value || '');
  return PASSWORD_REQUIREMENTS
    .filter(rule => !rule.test(password))
    .map(rule => rule.message);
}

function passwordValidationMessage(value) {
  const errors = passwordValidationErrors(value);
  return errors.length ? `Password must include ${errors.join(', ')}.` : '';
}

function passwordStrengthLevel(value) {
  const passed = PASSWORD_REQUIREMENTS.length - passwordValidationErrors(value).length;
  if (passed >= 6) return 3;
  if (passed >= 4) return 2;
  if (passed >= 2) return 1;
  return 0;
}

function updatePasswordStrength(inputEl, buttonId) {
  if (!inputEl || !inputEl.closest) return;

  const bars = Array.from(inputEl.closest('.modal-form').querySelectorAll('.pw-bar'));
  if (bars.length) {
    const level = passwordStrengthLevel(inputEl.value || '');
    const colors = ['#e87a7a', '#f5d06b', '#7ecfb3', '#7ecfb3'];
    bars.forEach((bar, i) => {
      bar.style.background = i <= level ? colors[level] : '#ddd';
    });
  }

  if (buttonId) {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = passwordValidationErrors(inputEl.value || '').length > 0;
  }
}
