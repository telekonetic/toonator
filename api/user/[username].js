export default async function handler(req, res) {
  const { username, page: pageParam } = req.query;
  const decodedUsername = decodeURIComponent(username).replace(/\/+$/, '');
  const page = parseInt((pageParam || '1').toString().replace(/\/+$/, '')) || 1;

  const html = getProfileHTML(decodedUsername, page);
  res.setHeader('Content-Type', 'text/html;charset=UTF-8');
  res.send(html);
}

function getProfileHTML(username, page) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${username} - Toonator. Make animation online.</title>
  <link rel="shortcut icon" href="/img/favicon-eyes.png"/>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/css/font.css">
  <link rel="stylesheet" href="/css/images_ru.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/config.js"></script>
  <script>
    const PROFILE_USERNAME = ${JSON.stringify(username)};
    const CURRENT_PAGE = ${page};
    const PER_PAGE = 12;
  </script>
  <script src="/js/auth.js"></script>
  <script>
    async function loadIncludes() {
      const [header, footer, donate, modal] = await Promise.all([
        fetch('/includes/header.html').then(r => r.text()),
        fetch('/includes/footer.html').then(r => r.text()),
        fetch('/includes/donate.html').then(r => r.text()),
        fetch('/includes/auth-modal.html').then(r => r.text())
      ]);
      document.getElementById('header_placeholder').innerHTML = header;
      document.getElementById('footer_placeholder').innerHTML = footer;
      document.getElementById('donate_placeholder').innerHTML = donate;
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
    <div class="userprofile">
      <div class="content_right">
        <div class="center">
          <h3 id="profile_username_wrap">
            <a href="/user/${username}" class="username foreign" id="profile_username">${username}</a>
          </h3>
          <div class="center">
            <img id="profile_avatar" src="/img/avatar100.gif" class="p100"/>
          </div>
        </div>
        Total toons: <span id="stat_toons">...</span><br/>
        <span id="stat_drafts_row" style="display:none">Total drafts: <span id="stat_drafts">0</span><br/></span>
        Total comments: <span id="stat_comments">0</span><br/>
        <br/>
        Rank: <b id="stat_rank">Passer</b><br/>
        <br/>
        <a id="private_messages_link" href="#" style="display:none; font-size:10pt;">Private messages</a>
      </div>
      <div class="content_left">
        <h1><span style="font-weight:normal">
          <a class="nmenu selected" href="/user/${username}/">Album</a> |
          <a class="nmenu" href="/user/${username}/favorites/">Favorites</a> |
          <a class="nmenu" href="/user/${username}/comments/">Comments</a>
        </span></h1>
        <div id="paginator_top"></div>
        <div class="toons_container">
          <div class="toons_list" id="toons_list">
            <p style="color:#888888; font-size:10pt; padding:10px 0;">Loading...</p>
          </div>
        </div>
        <div id="paginator_bottom"></div>
      </div>
    </div>
    <div style="clear:both"></div>
  </div>
  <div id="donate_placeholder"></div>
  <div id="footer_placeholder"></div>
</div>

<script>
async function loadProfile() {
  const { data: profile, error } = await db.rpc('get_user_by_username', { p_username: PROFILE_USERNAME });

  if (error || !profile || profile.length === 0) {
    document.getElementById('toons_list').innerHTML = '<p style="color:#888888;font-size:10pt;padding:10px 0;">User not found.</p>';
    document.getElementById('stat_toons').textContent = '0';
    return;
  }

  const userId = profile[0].id;
  const isRussian = profile[0].russian || false;

  if (isRussian) {
    document.getElementById('profile_username').classList.add('russian');
  }

  const [{ count }, { count: commentCount }] = await Promise.all([
    db.from('animations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  ]);

  document.getElementById('stat_toons').textContent = count || 0;
  document.getElementById('stat_comments').textContent = commentCount || 0;

  const { data: { user: currentUser } } = await db.auth.getUser();
  const isOwnProfile = currentUser && (currentUser.user_metadata?.username === PROFILE_USERNAME);

  const avatarEl = document.getElementById('profile_avatar');
  const avatarToon = isOwnProfile
    ? (currentUser?.user_metadata?.avatar_toon || profile[0].avatar_toon)
    : profile[0].avatar_toon;

  if (avatarToon) {
    avatarEl.src = 'https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/' + avatarToon + '_100.gif';
  }
  avatarEl.onerror = () => { avatarEl.src = '/img/avatar100.gif'; };

  if (isOwnProfile) {
    avatarEl.insertAdjacentHTML('afterend', '<br/><a href="#" onclick="changeAvatar(); return false;" style="font-size:9pt;">[Change avatar]</a>');
    const { count: draftCount } = await db.from('animations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('draft', true);
    document.getElementById('stat_drafts_row').style.display = '';
    document.getElementById('stat_drafts').textContent = draftCount || 0;
  }

  if (currentUser && !isOwnProfile) {
    const pmLink = document.getElementById('private_messages_link');
    pmLink.href = '/messages/' + PROFILE_USERNAME + '/';
    pmLink.style.display = '';
  }

  const totalPages = Math.ceil((count || 0) / PER_PAGE);
  const offset = (CURRENT_PAGE - 1) * PER_PAGE;

  const { data: toons } = await db.from('animations').select('id, title, frames, created_at')
    .eq('user_id', userId)
    .eq('draft', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  const toonIds = (toons || []).map(t => t.id);
  let commentCounts = {};
  if (toonIds.length > 0) {
    const { data: counts } = await db.from('comments').select('animation_id').in('animation_id', toonIds);
    (counts || []).forEach(c => { commentCounts[c.animation_id] = (commentCounts[c.animation_id] || 0) + 1; });
  }

  renderToons(toons || [], commentCounts);
  renderPaginator(totalPages, 'paginator_top');
  renderPaginator(totalPages, 'paginator_bottom');
}

function renderToons(toons, commentCounts) {
  const list = document.getElementById('toons_list');
  if (toons.length === 0) {
    list.innerHTML = '<p style="color:#888888;font-size:10pt;padding:10px 0;">No toons yet.</p>';
    return;
  }
  list.innerHTML = toons.map(toon => {
    const frames = Array.isArray(toon.frames) ? toon.frames : (toon.frames ? Object.values(toon.frames) : []);
    const frameCount = frames.length || 1;
    const title = toon.title || 'Untitled';
    const frameLabel = frameCount === 1 ? '1 frame' : '<b>' + frameCount + '</b> frames';
    const cc = commentCounts[toon.id] || 0;
    const commentLabel = cc === 0 ? '<span class="grayb">No comments</span>' : '<b>' + cc + '</b> comment' + (cc === 1 ? '' : 's');
    return '<div class="toon_preview toon_preview_' + toon.id + '">' +
      '<div class="toon_image"><a href="/toon/' + toon.id + '" title="' + title + '">' +
        '<img src="https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/' + toon.id + '_100.gif" width="200" height="100" alt="' + title + '"/>' +
      '</a></div>' +
      '<div class="toon_name"><a class="link" href="/toon/' + toon.id + '">' + title + '</a></div>' +
      '<div class="toon_tagline">' + frameLabel + '</div>' +
      '<div class="toon_tagline">' + commentLabel + '</div>' +
    '</div>';
  }).join('');
}

function renderPaginator(totalPages, containerId) {
  if (totalPages <= 1) return;
  const container = document.getElementById(containerId);
  const maxShow = 5;
  const shown = Math.min(totalPages, maxShow);
  let items = '';
  for (let i = 1; i <= shown; i++) {
    items += i === CURRENT_PAGE
      ? '<li class="current"><a href="/user/' + PROFILE_USERNAME + '/' + i + '/">' + i + '</a></li>'
      : '<li><a href="/user/' + PROFILE_USERNAME + '/' + i + '/">' + i + '</a></li>';
  }
  if (totalPages > maxShow) items += '<li class="dots">...</li>';
  container.innerHTML = '<div class="paginator"><ul class="paginator">' + items + '</ul><div style="clear:both"></div></div>';
}

async function changeAvatar() {
  const toonId = prompt('Enter toon ID to use as avatar:');
  if (!toonId) return;
  const { error: authError } = await db.auth.updateUser({ data: { avatar_toon: toonId } });
  const { error: profileError } = await db.from('profiles').update({ avatar_toon: toonId }).eq('username', PROFILE_USERNAME);
  if (!authError && !profileError) {
    document.getElementById('profile_avatar').src = 'https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/' + toonId + '_100.gif';
  } else {
    alert('Error saving avatar: ' + (authError?.message || profileError?.message));
  }
}

loadProfile();
</script>
</body>
</html>`;
}