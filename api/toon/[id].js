const SUPABASE_URL = 'https://ytyhhmwnnlkhhpvsurlm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eWhobXdubmxraGhwdnN1cmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcwNTAsImV4cCI6MjA4ODU1MzA1MH0.XZVH3j6xftSRULfhdttdq6JGIUSgHHJt9i-vXnALjH0';

async function supabase(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) return null;
  return res.json();
}

async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  if (!res.ok) return null;
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(404).send('Not found');
  }

  const toons = await supabase(`/animations?id=eq.${id}&select=*`);
  if (!toons || toons.length === 0) {
    return res.status(404).send('Toon not found');
  }

  const toon = toons[0];

  let authorUsername = 'unknown';
  let authorAvatar = '/img/avatar100.gif';

  if (toon.user_id) {
    const userData = await rpc('get_user_by_id', { p_user_id: toon.user_id });
    if (userData && userData.length > 0) {
      authorUsername = userData[0].username || 'unknown';
      const avatarToonId = userData[0].avatar_toon_id || userData[0].avatar_toon || null;
      if (avatarToonId) {
        authorAvatar = `${SUPABASE_URL}/storage/v1/object/public/previews/${avatarToonId}_100.gif`;
      }
    }
  }

  let continuedFromHtml = '';
  if (toon.continued_from) {
    const origToons = await supabase(`/animations?id=eq.${toon.continued_from}&select=id,title,user_id`);
    if (origToons && origToons.length > 0) {
      const orig = origToons[0];
      let origAuthor = 'unknown';
      if (orig.user_id) {
        const origUser = await rpc('get_user_by_id', { p_user_id: orig.user_id });
        if (origUser && origUser.length > 0) origAuthor = origUser[0].username || 'unknown';
      }
      const origTitle = orig.title || 'Untitled';
      continuedFromHtml = `<div style="font-size:9pt; margin-top:5px;">
        Original: <a href="/toon/${orig.id}" class="noh" title="${origTitle} (${origAuthor})">
          &#x25ce; ${origTitle}
        </a> by <a href="/user/${origAuthor}" class="username foreign">${origAuthor}</a>
      </div>`;
    }
  }

  const frames = Array.isArray(toon.frames) ? toon.frames : (toon.frames ? Object.values(toon.frames) : []);
  const toonSettings = toon.settings || {};
  const title = toon.title || 'Untitled';
  const description = toon.description || '';
  const keywords = toon.keywords || '';
  const createdAt = formatDate(toon.created_at);
  const previewUrl = `${SUPABASE_URL}/storage/v1/object/public/previews/${id}_100.gif`;

  const tagsHtml = keywords
    ? keywords.split(',').map(k => k.trim()).filter(Boolean).map(k =>
        `<a href="/search/${encodeURIComponent(k)}" class="tag">${k}</a>`
      ).join(' ')
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${title} - Toonator.com - Draw animation online!</title>
  <link rel="shortcut icon" href="/img/favicon-eyes.png"/>
  <link href="/css/font.css" type="text/css" rel="stylesheet"/>
  <link href="/css/images.css" type="text/css" rel="stylesheet"/>
  <link href="/style.css" type="text/css" rel="stylesheet"/>
  <meta property="og:title" content="${title} - Toonator. Draw animation yourself!"/>
  <meta property="og:description" content="${description || title}"/>
  <meta property="og:image" content="${previewUrl}"/>
  <meta property="og:url" content="https://toonator.site/toon/${id}"/>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    const SUPABASE_URL = '${SUPABASE_URL}';
    const SUPABASE_KEY = '${SUPABASE_ANON_KEY}';
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  </script>
  <script src="/js/auth.js"></script>
  <script src="/js/toon-player.js"></script>
  <script>
    async function loadIncludes() {
      const header = await fetch('/includes/header.html').then(r => r.text());
      const footer = await fetch('/includes/footer.html').then(r => r.text());
      const donate = await fetch('/includes/donate.html').then(r => r.text());
      const modal  = await fetch('/includes/auth-modal.html').then(r => r.text());
      document.getElementById('donate_placeholder').innerHTML = donate;
      document.getElementById('header_placeholder').innerHTML = header;
      document.getElementById('footer_placeholder').innerHTML = footer;
      document.body.insertAdjacentHTML('beforeend', modal);
      updateAuthUI();
    }
    loadIncludes();
  </script>
</head>
<body>

<div id="header_placeholder"></div>

<div id="content_wrap">
  <div id="content">
    <div id="toon_page">

      <div class="toon_panel">
        <h2><span id="toon_title">${title}</span></h2>

        <div class="player" id="player_container"></div>

        <div class="info">
          <div class="author">
            <img class="avatar" id="author_avatar" src="${authorAvatar}" onerror="this.src='/img/avatar100.gif'"/>
            <div class="author_name">
              <a href="/user/${authorUsername}" class="username foreign">${authorUsername}</a>
            </div>
            <div class="date">${createdAt}</div>
            ${continuedFromHtml}
          </div>

          <div class="prizes"></div>

          <div class="buttons">
            <div class="toonmedals"></div>
            <div class="like hover">
              <a id="like_link" href="#" onclick="handleLike(); return false;" class="hover">
                <img src="/img/1.gif" class="img_like"/><span class="black" id="like_value">0</span> Like
              </a>
            </div>
            <div class="favorites">
              <a href="#" class="hover" id="favlink" onclick="handleFavorite(); return false;">
                <img src="/img/1.gif" class="img_favorites"/>Favorites
              </a>
            </div>
            <div class="draw">
              <a href="/draw/?continue=${id}" class="hover">
                <img src="/img/1.gif" class="img_pencil"/>Continue
              </a>
            </div>
          </div>

          <div class="line_5"><img src="/img/1.gif"/></div>

          <div class="description" id="description_text_div">
            <span id="description_text">${description}</span>
          </div>

          ${tagsHtml ? `<div class="tags" style="margin:5px 0;">${tagsHtml}</div>` : ''}

          <div class="share">
            <ul class="share">
              <li>Share:</li>
              <li><a rel="nofollow" title="Twitter" href="https://twitter.com/intent/tweet?url=https://toonator.site/toon/${id}&text=${encodeURIComponent(title)}" target="_blank"><div class="shr_tw"></div></a></li>
              <li><a rel="nofollow" title="Reddit" href="https://reddit.com/submit?url=https://toonator.site/toon/${id}&title=${encodeURIComponent(title)}" target="_blank"><div class="shr_reddit"></div></a></li>
            </ul>
          </div>

          <div class="tcontinues"></div>
        </div>

        <div class="left_panel">
          <div class="toon_comments" id="comments">
            <span class="header">
              <span style="float:left">Comments</span>
              <a href="#" class="new" id="addCommentBtn" onclick="showCommentForm(); return false;">Add comment</a>
              <div style="clear:both"></div>
            </span>
            <div id="comments_form" style="display:none;">
              <div class="form2">
                <textarea id="comment_text" rows="3" placeholder="Write a comment..." style="border:1px solid #cccccc;margin:10px;width:580px;font-family:Arial;font-size:10pt;"></textarea>
              </div>
              <div class="form2" style="text-align:right;margin-right:10px;margin-bottom:10px;">
                <button onclick="postComment(); return false;">Post</button>
                <button onclick="document.getElementById('comments_form').style.display='none'; return false;">Cancel</button>
              </div>
            </div>
            <div id="comments_list">
              <p style="color:#888888;font-size:10pt;padding:10px;">No comments yet.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
    <div style="clear:both"></div>
  </div>

  <div id="donate_placeholder"></div>
  <div id="footer_placeholder"></div>
</div>

<script>
const TOON_FRAMES = ${JSON.stringify(frames)};
const TOON_ID = '${id}';
const TOON_SETTINGS = ${JSON.stringify(toonSettings)};

initToonPlayer('player_container', TOON_FRAMES, TOON_SETTINGS);

function showCommentForm() {
  db.auth.getUser().then(({ data: { user } }) => {
    if (!user) { showAuth('login'); return; }
    document.getElementById('comments_form').style.display = 'block';
    document.getElementById('comment_text').focus();
  });
}

async function loadComments() {
  const { data, error } = await db
    .from('comments')
    .select('*')
    .eq('animation_id', TOON_ID)
    .order('created_at', { ascending: false })
    .limit(20);

  const list = document.getElementById('comments_list');
  if (!data || data.length === 0) {
    list.innerHTML = '<p style="color:#888888;font-size:10pt;padding:10px;">No comments yet.</p>';
    return;
  }

  const usernames = [...new Set(data.map(c => c.author_username).filter(Boolean))];
  const avatarMap = {};

  await Promise.all(usernames.map(async (uname) => {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_user_by_username', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_username: uname })
      });
      const userData = await res.json();
      if (userData && userData.length > 0) {
        const avatarToonId = userData[0].avatar_toon_id || userData[0].avatar_toon || null;
        avatarMap[uname] = avatarToonId
          ? SUPABASE_URL + '/storage/v1/object/public/previews/' + avatarToonId + '_100.gif'
          : '/img/avatar100.gif';
      } else {
        avatarMap[uname] = '/img/avatar100.gif';
      }
    } catch (e) {
      avatarMap[uname] = '/img/avatar100.gif';
    }
  }));

  list.innerHTML = data.map(c => {
    const username = c.author_username || 'anonymous';
    const avatar = avatarMap[username] || '/img/avatar100.gif';
    const date = new Date(c.created_at);
    const dateStr = date.toLocaleDateString('en-US') + ' ' + date.toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'});
    return \`<div class="comment">
      <div class="avatar">
        <a href="/user/\${username}"><img class="avatar" src="\${avatar}" onerror="this.src='/img/avatar100.gif'"/></a>
      </div>
      <div class="head">
        <a href="/user/\${username}" class="username foreign">\${username}</a>
        <span class="date"><b>\${dateStr}</b></span>
      </div>
      <div class="text">\${c.text}</div>
    </div>\`;
  }).join('');
}

async function postComment() {
  const text = document.getElementById('comment_text').value.trim();
  if (!text) return;
  const { data: { user } } = await db.auth.getUser();
  if (!user) { showAuth('login'); return; }
  const username = user.user_metadata?.username || user.email;
  const { error } = await db.from('comments').insert({
    animation_id: TOON_ID,
    user_id: user.id,
    author_username: username,
    text: text
  });
  if (!error) {
    document.getElementById('comment_text').value = '';
    document.getElementById('comments_form').style.display = 'none';
    loadComments();
  } else {
    alert('Error posting comment: ' + error.message);
  }
}

async function loadLikes() {
  const { data: toon } = await db.from('animations').select('likes').eq('id', TOON_ID).single();
  if (toon) document.getElementById('like_value').textContent = toon.likes || 0;
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    const { data: existing } = await db.from('likes').select('id').eq('animation_id', TOON_ID).eq('user_id', user.id).maybeSingle();
    if (existing) document.getElementById('like_link').classList.add('active');
  }
}

async function handleLike() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { showAuth('login'); return; }
  const link = document.getElementById('like_link');
  const valueEl = document.getElementById('like_value');
  const alreadyLiked = link.classList.contains('active');
  if (alreadyLiked) {
    const { error } = await db.from('likes').delete().eq('animation_id', TOON_ID).eq('user_id', user.id);
    if (!error) { link.classList.remove('active'); valueEl.textContent = Math.max(0, parseInt(valueEl.textContent) - 1); }
  } else {
    const { error } = await db.from('likes').upsert({ animation_id: TOON_ID, user_id: user.id }, { onConflict: 'animation_id,user_id', ignoreDuplicates: true });
    if (!error) { link.classList.add('active'); valueEl.textContent = parseInt(valueEl.textContent) + 1; }
  }
}

function handleFavorite() {
  db.auth.getUser().then(({ data: { user } }) => {
    if (!user) { showAuth('login'); return; }
    alert('Favorites feature coming soon!');
  });
}

async function loadAuthorAvatar() {
  const username = ${JSON.stringify(authorUsername)};
  if (!username || username === 'unknown') return;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_user_by_username', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_username: username })
    });
    const userData = await res.json();
    if (userData && userData.length > 0) {
      const avatarToonId = userData[0].avatar_toon_id || userData[0].avatar_toon || null;
      if (avatarToonId) {
        const avatarEl = document.getElementById('author_avatar');
        if (avatarEl) avatarEl.src = SUPABASE_URL + '/storage/v1/object/public/previews/' + avatarToonId + '_100.gif';
      }
    }
  } catch (e) {}
}

loadAuthorAvatar();
loadLikes();
loadComments();
</script>

</body>
</html>`;

  res.setHeader('Content-Type', 'text/html;charset=UTF-8');
  res.send(html);
}