async function updateAuthUI() {
  const { data: { user } } = await db.auth.getUser();
  const menu = document.getElementById('newmenu');
  if (user) {
    const username = user.user_metadata?.username || user.email;
    menu.innerHTML = `<li>${username}</li><li><a href="#" onclick="signOut(); return false;">Sign Out</a></li>`;
  } else {
    menu.innerHTML = `<li><a href="#" onclick="showAuth('join'); return false;">Join</a></li><li><a href="#" onclick="showAuth('login'); return false;">Sign In</a></li>`;
  }
}

function toggleOldSignin() {
  const el = document.getElementById('signin-old');
  el.classList.toggle('hidden');
}

async function signOut() {
  await db.auth.signOut();
  updateAuthUI();
}

let authMode = 'login';

function showAuth(mode) {
  authMode = mode;
  if (mode === 'join') {
    window.location.href = '/register/';
    return;
  }
  document.getElementById('authModal').style.display = 'block';
  document.getElementById('authError').innerText = '';
}

function closeAuth() {
  document.getElementById('authModal').style.display = 'none';
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  let result;

  if (authMode === 'join') {
    result = await db.auth.signUp({ email, password });
  } else {
    result = await db.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    document.getElementById('authError').innerText = result.error.message;
  } else {
    closeAuth();
    updateAuthUI();
  }
}