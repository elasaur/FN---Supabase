// Password visibility toggle: add an eye button to every password field.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.closest('.password-field')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle-btn';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('title', 'Show password');
    button.innerHTML = '<img class="password-toggle-icon" src="/icons-pack/icons8-eye-50.png" alt="">';

    button.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      button.classList.toggle('is-visible', isHidden);
      button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      button.setAttribute('title', isHidden ? 'Hide password' : 'Show password');
    });

    wrapper.appendChild(button);
  });
});
