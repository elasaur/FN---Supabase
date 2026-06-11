// Settings feature: profile, credentials, bulk cleanup, and account deletion.
//
// All fetch() calls include the Supabase access token in the Authorization
// header so the @login_required decorator on the Flask side can verify the
// request via Supabase Auth (no local password hashes).
//
// TokenStore is defined in index.html / app.html and manages the in-memory
// + sessionStorage token cache.

// Auth header helper: attach the current Supabase access token to settings calls.
function authHeaders(extra = {}) {
  const token = (typeof TokenStore !== 'undefined' && TokenStore.access)
    ? TokenStore.access
    : (sessionStorage.getItem('fn_access') || '');
  const headers = {
    'Content-Type':  'application/json',
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// Name settings: update local profile rows and visible UI labels.
async function saveName() {
  const btn = window.event?.currentTarget;
  const v = document.getElementById('editNameInput').value.trim();
  if (!v) return;

  setButtonLoading(btn, true, 'Saving...');
  try {
    const res = await fetch('/api/user', {
      method:  'PUT',
      credentials: 'same-origin',
      headers: authHeaders(),
      body:    JSON.stringify({ name: v }),
    });

    if (!res.ok) {
      const text = await res.text();
      showToast(text || 'Server error while updating name.', 'error');
      return;
    }

    const data = await res.json();
    if (data.success) {
      window.FILE_NEST_USER = { ...(window.FILE_NEST_USER || {}), name: v };
      const userName = document.getElementById('userName');
      const userAvatar = document.getElementById('userAvatar');
      const greetName = document.getElementById('greetName');
      const settingsName = document.getElementById('settingsName');
      if (userName) userName.textContent = v;
      if (userAvatar) userAvatar.textContent = v.charAt(0).toUpperCase();
      if (greetName) greetName.textContent = displayGivenNames(v);
      if (settingsName) settingsName.textContent = v;
      closeModal('editName');
      showToast('Name updated.', 'success');
    } else {
      setButtonLoading(btn, false);
      showToast(data.message || 'Unable to update name.', 'error');
    }
  } catch (err) {
    setButtonLoading(btn, false);
    showToast('Network error while updating name.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Email settings: request a Supabase Auth email change and mirror profile data.
async function saveEmail() {
  const btn = window.event?.currentTarget;
  const v = document.getElementById('editEmailInput').value.trim();
  if (!v) return;

  setButtonLoading(btn, true, 'Saving...');
  try {
    const res = await fetch('/api/user', {
      method:  'PUT',
      credentials: 'same-origin',
      headers: authHeaders(),
      body:    JSON.stringify({ email: v }),
    });

    if (!res.ok) {
      const text = await res.text();
      showToast(text || 'Server error while updating email.', 'error');
      return;
    }

    const data = await res.json();
    if (data.success) {
      window.FILE_NEST_USER = { ...(window.FILE_NEST_USER || {}), email: v };
      document.getElementById('userEmail').textContent     = v;
      document.getElementById('settingsEmail').textContent = v;
      closeModal('editEmail');
      setButtonLoading(btn, false);
      showToast('Confirmation sent to new email. Please verify it.', 'success');
    } else {
      setButtonLoading(btn, false);
      showToast(data.message || 'Unable to update email.', 'error');
    }
  } catch (err) {
    setButtonLoading(btn, false);
    showToast('Network error while updating email.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Password settings: validate, update, and refresh the active session tokens.
function openChangePasswordModal() {
  const currentInput = document.getElementById('editPasswordCurrent');
  const newInput = document.getElementById('editPasswordNew');
  const confirmInput = document.getElementById('editPasswordConfirm');
  const submitButton = document.getElementById('editPasswordSubmit');
  [currentInput, newInput, confirmInput].forEach(input => {
    if (input) input.value = '';
  });
  if (submitButton) submitButton.disabled = true;
  setSettingsPasswordMessage('');
  if (newInput && typeof updatePasswordStrength === 'function') {
    updatePasswordStrength(newInput, 'editPasswordSubmit');
  }
  updateSettingsPasswordFormState();
  openModal('editPassword');
}

function updateSettingsPasswordStrength(inputEl) {
  if (typeof updatePasswordStrength === 'function') {
    updatePasswordStrength(inputEl, 'editPasswordSubmit');
  }
  updateSettingsPasswordFormState();
}

function setSettingsPasswordMessage(message, type = 'error') {
  const messageEl = document.getElementById('editPasswordMessage');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.style.display = message ? 'block' : 'none';
  messageEl.classList.toggle('success', Boolean(message && type === 'success'));
}

function getSettingsPasswordValidationMessage(showEmpty = false) {
  const current = document.getElementById('editPasswordCurrent')?.value || '';
  const newPw = document.getElementById('editPasswordNew')?.value || '';
  const confirm = document.getElementById('editPasswordConfirm')?.value || '';

  if (!current && showEmpty) return 'Current password is required.';
  if (!newPw && showEmpty) return 'New password is required.';
  if (!confirm && showEmpty) return 'Confirm password is required.';

  if (current && newPw && current === newPw) {
    return 'New password cannot be the same as your current password.';
  }

  if (newPw && typeof passwordValidationMessage === 'function') {
    const passwordMessage = passwordValidationMessage(newPw);
    if (passwordMessage) return passwordMessage;
  }

  if (newPw && confirm && newPw !== confirm) {
    return 'Passwords do not match.';
  }

  return '';
}

function updateSettingsPasswordFormState(showMessage = true) {
  const current = document.getElementById('editPasswordCurrent')?.value || '';
  const newPw = document.getElementById('editPasswordNew')?.value || '';
  const confirm = document.getElementById('editPasswordConfirm')?.value || '';
  const submitButton = document.getElementById('editPasswordSubmit');
  if (!submitButton) return;

  const passwordIsStrong = typeof passwordValidationErrors === 'function'
    ? passwordValidationErrors(newPw).length === 0
    : Boolean(newPw);
  const passwordsMatch = Boolean(newPw && confirm && newPw === confirm);
  const passwordIsNew = Boolean(current && newPw && current !== newPw);
  submitButton.disabled = !current || !passwordIsStrong || !passwordsMatch || !passwordIsNew;

  if (showMessage) {
    setSettingsPasswordMessage(getSettingsPasswordValidationMessage(false));
  }
}

async function savePassword(button) {
  const btn = button || window.event?.currentTarget;
  const current = document.getElementById('editPasswordCurrent')?.value || '';
  const newPw = document.getElementById('editPasswordNew')?.value || '';
  const confirm = document.getElementById('editPasswordConfirm')?.value || '';

  const validationMessage = getSettingsPasswordValidationMessage(true);
  if (validationMessage) {
    setSettingsPasswordMessage(validationMessage);
    updateSettingsPasswordFormState(false);
    return;
  }

  setSettingsPasswordMessage('');
  setButtonLoading(btn, true, 'Updating...');
  try {
    const res = await fetch('/api/user/password', {
      method:  'PUT',
      credentials: 'same-origin',
      headers: authHeaders(),
      body:    JSON.stringify({
        current_password: current,
        new_password: newPw,
        confirm_password: confirm,
      }),
    });

    if (!res.ok) {
      let message = 'Server error while updating password.';
      const text = await res.text();
      try {
        const errorData = text ? JSON.parse(text) : {};
        message = errorData.message || text || message;
      } catch (parseErr) {
        message = text || message;
      }
      setSettingsPasswordMessage(message);
      return;
    }

    const data = await res.json();
    if (data.success) {
      if (data.access_token) {
        if (typeof TokenStore !== 'undefined') {
          TokenStore.set(data.access_token, data.refresh_token || '');
        } else {
          sessionStorage.setItem('fn_access', data.access_token);
          sessionStorage.setItem('fn_refresh', data.refresh_token || '');
        }
      }
      ['editPasswordCurrent', 'editPasswordNew', 'editPasswordConfirm'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
      });
      setSettingsPasswordMessage('Password updated successfully.', 'success');
      closeModal('editPassword');
      setButtonLoading(btn, false);
      showToast('Password updated.', 'success');
    } else {
      setButtonLoading(btn, false);
      setSettingsPasswordMessage(data.message || 'Unable to update password.');
    }
  } catch (err) {
    setButtonLoading(btn, false);
    setSettingsPasswordMessage('Network error while updating password.');
  } finally {
    setButtonLoading(btn, false);
    updateSettingsPasswordFormState(false);
  }
}

// Member-since settings: display the profile creation date.
async function loadMemberSince() {
  const res  = await fetch('/api/user', {
    credentials: 'same-origin',
    headers: authHeaders(),
  });
  if (!res.ok) return;

  const data = await res.json();
  const el   = document.getElementById('memberSince');
  if (el && data.created_at) {
    const date = parseAppDate(data.created_at);
    el.textContent = date
      ? date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Unknown';
  }
}

// Bulk file deletion: clear all current-user files after confirmation.
async function deleteAllFiles() {
  openModal('deleteAllFiles');
}

async function confirmDeleteAllFiles() {
  const btn = window.event?.currentTarget;
  setButtonLoading(btn, true, 'Deleting...');
  let toastMessage = '';
  let toastType = 'warn';
  const res  = await fetch('/api/files/delete-all', {
    method:  'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (data.success) {
    closeModal('deleteAllFiles');
    clearCachedFiles();
    toastMessage = 'All files deleted.';
    syncCachesSilently();
  } else {
    toastType = 'error';
    toastMessage = data.message || 'Something went wrong.';
  }
  setButtonLoading(btn, false);
  if (toastMessage) showToast(toastMessage, toastType);
}

// Bulk folder deletion: remove non-default folders and their files.
async function deleteAllFolders() {
  openModal('deleteAllFolders');
}

async function confirmDeleteAllFolders() {
  const btn = window.event?.currentTarget;
  setButtonLoading(btn, true, 'Deleting...');
  let toastMessage = '';
  let toastType = 'warn';
  const res  = await fetch('/api/folders/delete-all', {
    method:  'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (data.success) {
    closeModal('deleteAllFolders');
    removeCachedNonDefaultFolders();
    toastMessage = `All folders deleted. ${data.deleted_files || 0} file${Number(data.deleted_files || 0) === 1 ? '' : 's'} deleted.`;
    syncCachesSilently();
  } else {
    toastType = 'error';
    toastMessage = data.message || 'Something went wrong.';
  }
  setButtonLoading(btn, false);
  if (toastMessage) showToast(toastMessage, toastType);
}

// Account deletion: soft-delete the account and clear local tokens.
async function deleteAccount() {
  openModal('deleteAccount');
}

async function confirmDeleteAccount() {
  const btn = window.event?.currentTarget;
  setButtonLoading(btn, true, 'Deleting...');
  const res  = await fetch('/api/user/delete', {
    method:  'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (data.success) {
    // Clear local token cache before redirecting to the landing page.
    if (typeof TokenStore !== 'undefined') TokenStore.clear();
    window.location.href = '/';
  } else {
    setButtonLoading(btn, false);
    showToast(data.message || 'Something went wrong.', 'error');
  }
}
