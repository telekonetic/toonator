export async function onRequestGet(context) {
  const { username } = context.params;
  const url = new URL(context.request.url);
  const page = parseInt(url.searchParams.get('page') || '1');

  const html = getProfileHTML(username, page);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
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
  <link rel="stylesheet" href="/css/images.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    const { createClient } = supabase;
    const db = createClient(
      'https://ytyhhmwnnlkhhpvsurlm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eWhobXdubmxraGhwdnN1cmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcwNTAsImV4cCI6MjA4ODU1MzA1MH0.XZVH3j6xftSRULfhdttdq6JGIUSgHHJt9i-vXnALjH0'
    );
    const PROFILE_USERNAME = ${JSON.stringify(username)};
    const CURRENT_PAGE = ${page};
    const PER_PAGE = 12;
  </script>
  <script src="/js/auth.js"></script>
  <script>
    async function loadIncludes() {
      const header = await fetch('/includes/header.html').then(r => r.text());
      const footer = await fetch('/includes/footer.html').then(r => r.text());
      const modal = await fetch('/includes/auth-modal.html').then(r => r.text());
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
        Total comments: <span id="stat_comments">0</span><br/>
        <br/>
        Rank: <b id="stat_rank">Passer</b><br/>
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

  // Count total toons
  const { count } = await db
    .from('animations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const totalToons = count || 0;
  document.getElementById('stat_toons').textContent = totalToons;

  const totalPages = Math.ceil(totalToons / PER_PAGE);
  const offset = (CURRENT_PAGE - 1) * PER_PAGE;

  // Fetch toons for this page
  const { data: toons } = await db
    .from('animations')
    .select('id, title, frames, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  renderToons(toons || []);
  renderPaginator(totalPages, 'paginator_top');
  renderPaginator(totalPages, 'paginator_bottom');
}

function renderToons(toons) {
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

    return '<div class="toon_preview toon_preview_' + toon.id + '">' +
      '<div class="toon_image">' +
        '<a href="/toon/' + toon.id + '" title="' + title + '">' +
          '<canvas class="toon_canvas" data-id="' + toon.id + '" width="200" height="100"></canvas>' +
        '</a>' +
      '</div>' +
      '<div class="toon_name"><a class="link" href="/toon/' + toon.id + '">' + title + '</a></div>' +
      '<div class="toon_tagline">' + frameLabel + '</div>' +
      '<div class="toon_tagline"><span class="grayb">No comments</span></div>' +
    '</div>';
  }).join('');

  // Store frames data and render previews
  toons.forEach(toon => {
    const canvas = document.querySelector('.toon_canvas[data-id="' + toon.id + '"]');
    if (!canvas) return;
    const frames = Array.isArray(toon.frames) ? toon.frames : (toon.frames ? Object.values(toon.frames) : []);
    if (!frames.length) return;
    try { drawFrame(canvas, frames[0]); } catch(e) {}
  });
}

function drawFrame(canvas, frame) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (!frame || !frame.strokes) return;
  frame.strokes.forEach(function(stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color || '#000000';
    ctx.lineWidth = (stroke.size || 2) * (w / 500);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
    for (var i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
    }
    ctx.stroke();
  });
}

function renderPaginator(totalPages, containerId) {
  if (totalPages <= 1) return;
  const container = document.getElementById(containerId);
  const maxShow = 5;
  const shown = Math.min(totalPages, maxShow);
  let items = '';
  for (let i = 1; i <= shown; i++) {
    if (i === CURRENT_PAGE) {
      items += '<li class="current"><a href="/user/' + PROFILE_USERNAME + '/' + i + '/">' + i + '</a></li>';
    } else {
      items += '<li><a href="/user/' + PROFILE_USERNAME + '/' + i + '/">' + i + '</a></li>';
    }
  }
  if (totalPages > maxShow) {
    items += '<li class="dots">...</li>';
  }
  container.innerHTML = '<div class="paginator"><ul class="paginator">' + items + '</ul><div style="clear:both"></div></div>';
}

loadProfile();
</script>
</body>
</html>`;
}