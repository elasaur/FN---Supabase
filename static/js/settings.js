// // ── Settings ───────────────────────────────────────────────────────────────────
// async function saveName() {
//   const v = document.getElementById('editNameInput').value.trim();
//   if (!v) return;
//   const res  = await fetch('/api/user', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:v }) });
//   const data = await res.json();
//   if (data.success) {
//     document.getElementById('userName').textContent     = v;
//     document.getElementById('userAvatar').textContent   = v[0].toUpperCase();
//     document.getElementById('greetName').textContent    = v;
//     document.getElementById('settingsName').textContent = v;
//     closeModal('editName'); showToast('✅ Name updated!', 'success');
//   }
// }

// async function saveEmail() {
//   const v = document.getElementById('editEmailInput').value.trim();
//   if (!v) return;
//   const res  = await fetch('/api/user', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:v }) });
//   const data = await res.json();
//   if (data.success) {
//     document.getElementById('userEmail').textContent     = v;
//     document.getElementById('settingsEmail').textContent = v;
//     closeModal('editEmail'); showToast('✅ Email updated!', 'success');
//   }
// }

// async function savePassword() {
//   const current = document.getElementById('editPasswordCurrent').value.trim();
//   const newPw   = document.getElementById('editPasswordNew').value.trim();
//   const confirm = document.getElementById('editPasswordConfirm').value.trim();

//   if (!current || !newPw || !confirm) {
//     showToast('Please fill in all fields.', 'warn');
//     return;
//   }

//   const res  = await fetch('/api/user/password', {
//     method: 'PUT',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       current_password: current,
//       new_password:     newPw,
//       confirm_password: confirm,
//     }),
//   });
//   const data = await res.json();

//   if (data.success) {
//     document.getElementById('editPasswordCurrent').value = '';
//     document.getElementById('editPasswordNew').value     = '';
//     document.getElementById('editPasswordConfirm').value = '';
//     closeModal('editPassword');
//     showToast('🔒 Password updated!', 'success');
//   } else {
//     showToast(data.message, 'error');
//   }
// }

// async function loadMemberSince() {
//   const res  = await fetch('/api/user');
//   const data = await res.json();
//   const el   = document.getElementById('memberSince');
// }

// async function deleteAllFiles() {
//   openModal('deleteAllFiles');
// }
 
// async function confirmDeleteAllFiles() {
//   closeModal('deleteAllFiles');
//   const res  = await fetch('/api/files/delete-all', { method: 'DELETE' });
//   const data = await res.json();
//   if (data.success) {
//     showToast('🗑️ All files deleted.', 'warn');
//     if (typeof loadFiles === 'function') loadFiles();
//     if (typeof loadStats === 'function') loadStats();
//   } else {
//     showToast('❌ ' + (data.message || 'Something went wrong.'), 'error');
//   }
// }
 
// async function deleteAllFolders() {
//   openModal('deleteAllFolders');
// }
 
// async function confirmDeleteAllFolders() {
//   closeModal('deleteAllFolders');
//   const res  = await fetch('/api/folders/delete-all', { method: 'DELETE' });
//   const data = await res.json();
//   if (data.success) {
//     showToast('🗂️ All folders deleted. Files moved to Uncategorized.', 'warn');
//     if (typeof loadFolders === 'function') loadFolders();
//     if (typeof loadStats   === 'function') loadStats();
//   } else {
//     showToast('❌ ' + (data.message || 'Something went wrong.'), 'error');
//   }
// }
 
// async function deleteAccount() {
//   openModal('deleteAccount');
// }
 
// async function confirmDeleteAccount() {
//   closeModal('deleteAccount');
//   const res  = await fetch('/api/user/delete', { method: 'DELETE' });
//   const data = await res.json();
//   if (data.success) window.location.href = '/';
//   else showToast('❌ ' + (data.message || 'Something went wrong.'), 'error');
// }

// ── Settings ───────────────────────────────────────────────────────────────────
//
// All fetch() calls include the Supabase access token in the Authorization
// header so the @login_required decorator on the Flask side can verify the
// request via Supabase Auth (no local password hashes).
//
// TokenStore is defined in index.html / app.html and manages the in-memory
// + sessionStorage token cache.

// ── Auth Header Helper ────────────────────────────────────────────────────────
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

// ── Name ──────────────────────────────────────────────────────────────────────
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
      window.location.reload();
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

// ── Email ─────────────────────────────────────────────────────────────────────
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

// ── Password ──────────────────────────────────────────────────────────────────
function openChangePasswordModal() {
  const emailInput = document.getElementById('editPasswordEmail');
  const email = (
    document.getElementById('settingsEmail')?.textContent ||
    window.FILE_NEST_USER?.email ||
    ''
  ).trim();
  if (emailInput) emailInput.value = email;
  openModal('editPassword');
}

async function sendSettingsPasswordReset(button) {
  const btn = button || window.event?.currentTarget;
  const email = (
    document.getElementById('editPasswordEmail')?.value ||
    document.getElementById('settingsEmail')?.textContent ||
    window.FILE_NEST_USER?.email ||
    ''
  ).trim();

  if (!email) {
    showToast('Account email is missing.', 'warn');
    return;
  }

  setButtonLoading(btn, true, 'Sending...');
  try {
    const res = await fetch('/change-password-email', {
      method:  'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });

    if (!res.ok) {
      const text = await res.text();
      showToast(text || 'Server error while sending reset link.', 'error');
      return;
    }

    const data = await res.json();
    if (data.success) {
      closeModal('editPassword');
      const sentEmail = document.getElementById('passwordResetSentEmail');
      if (sentEmail) sentEmail.textContent = email;
      openModal('passwordResetSent');
      setButtonLoading(btn, false);
      showToast('Password reset link sent. Check your email.', 'success');
    } else {
      setButtonLoading(btn, false);
      showToast(data.message || 'Unable to send reset link.', 'error');
    }
  } catch (err) {
    setButtonLoading(btn, false);
    showToast('Network error while sending reset link.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function savePassword() {
  return sendSettingsPasswordReset();
}

// ── Member Since ──────────────────────────────────────────────────────────────
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

// ── Delete All Files ──────────────────────────────────────────────────────────
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
    await Promise.all([loadAllFiles(), loadUploadFileList(), loadDashboard(), loadStats(), loadFolders()]);
    toastMessage = 'All files deleted.';
  } else {
    toastType = 'error';
    toastMessage = data.message || 'Something went wrong.';
  }
  setButtonLoading(btn, false);
  if (toastMessage) showToast(toastMessage, toastType);
}

// ── Delete All Folders ────────────────────────────────────────────────────────
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
    await Promise.all([loadFolders(), loadAllFiles(), loadUploadFileList(), loadDashboard(), loadStats()]);
    toastMessage = 'All folders deleted. Files moved to Uncategorized.';
  } else {
    toastType = 'error';
    toastMessage = data.message || 'Something went wrong.';
  }
  setButtonLoading(btn, false);
  if (toastMessage) showToast(toastMessage, toastType);
}

// ── Delete Account ────────────────────────────────────────────────────────────
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
    // Clear local token cache before redirecting
    if (typeof TokenStore !== 'undefined') TokenStore.clear();
    window.location.href = '/';
  } else {
    setButtonLoading(btn, false);
    showToast(data.message || 'Something went wrong.', 'error');
  }
}
