let authMode = 'login';

async function updateAuthUI() {
  const { data: { user } } = await db.auth.getUser();
  const menu = document.getElementById('newmenu');
  if (!menu) return; // safety guard

  if (user) {
    const username = user.user_metadata?.username || user.email;
    menu.innerHTML = `
      <li><a href="/user/${username}">${username}</a></li>
      <li><a href="#" onclick="signOut(); return false;">Sign Out</a></li>
    `;
  } else {
    menu.innerHTML = `
      <li><a href="#" onclick="showAuth('join'); return false;">Join</a></li>
      <li><a href="#" onclick="showAuth('login'); return false;">Sign In</a></li>
    `;
  }
}

async function signOut() {
  await db.auth.signOut();
  updateAuthUI();
}

function showAuth(mode) {
  authMode = mode;

  if (mode === 'join') {
    window.location.href = '/register/';
    return;
  }

  const modal = document.getElementById('authModal');
  modal.style.display = 'block';
  document.getElementById('authError').innerText = '';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
}

function closeAuth() {
  document.getElementById('authModal').style.display = 'none';
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');

  if (!email || !password) {
    errorEl.innerText = 'Please enter your email and password.';
    return;
  }

  let result;
  if (authMode === 'join') {
    result = await db.auth.signUp({ email, password });
  } else {
    result = await db.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    errorEl.innerText = result.error.message;
  } else {
    closeAuth();
    updateAuthUI();
  }
}

function toggleOldSignin() {
  const el = document.getElementById('signin-old');
  if (el) el.classList.toggle('hidden');
}