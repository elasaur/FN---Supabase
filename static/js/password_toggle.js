// Password visibility toggle: add an eye button to every password field.
document.addEventListener('DOMContentLoaded', () => {
  const eyeIcon = "/icons-pack/custom-svg/eye.svg";
  const eyeSlashIcon = "/icons-pack/custom-svg/eye-slash.svg";

  function toggleIcon(isVisible) {
    const icon = isVisible ? eyeSlashIcon : eyeIcon;
    return `<span class="svg-icon password-toggle-icon" style="--svg-icon:url('${icon}');" aria-hidden="true"></span>`;
  }

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
    button.innerHTML = toggleIcon(false);

    button.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      button.classList.toggle('is-visible', isHidden);
      button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      button.setAttribute('title', isHidden ? 'Hide password' : 'Show password');
      button.innerHTML = toggleIcon(isHidden);
    });

    wrapper.appendChild(button);
  });
});
