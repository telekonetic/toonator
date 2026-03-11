// Toon Page Controller - Main logic for toon page
import {
  getToonById,
  getAuthorData,
  getContinuedFromInfo,
  loadIncludes,
  escapeHTML,
  formatDate,
} from "/js/api.js";
import {
  initializeLikes,
  handleLike,
  handleFavorite,
} from "/js/components/likes.js";
import {
  loadComments,
  showCommentForm,
  postCommentHandler,
} from "/js/components/comments.js";

const SUPABASE_URL = "https://ytyhhmwnnlkhhpvsurlm.supabase.co";

export async function initToon(toonId) {
  // Load header, footer, and includes
  const { header, footer, donate, modal } = await loadIncludes();
  if (header) document.getElementById("header_placeholder").innerHTML = header;
  if (footer) document.getElementById("footer_placeholder").innerHTML = footer;
  if (donate) document.getElementById("donate_placeholder").innerHTML = donate;
  if (modal) document.body.insertAdjacentHTML("beforeend", modal);
  if (window.updateAuthUI) updateAuthUI();

  // Load toon data
  const toonData = await getToonById(toonId);
  if (!toonData) {
    document.getElementById("toon_page").innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px 0;">Toon not found.</p>';
    return;
  }

  // Get author data
  const authorData = await getAuthorData(toonData.user_id);
  const authorUsername = authorData.username;

  const title = escapeHTML(toonData.title || "Untitled");
  const description = escapeHTML(toonData.description || "");

  // Update page title and meta tags
  document.getElementById("page_title").textContent = title + " - Toonator";
  document.getElementById("og_title").content =
    title + " - Toonator. Draw animation yourself!";
  document.getElementById("og_description").content = description || title;
  document.getElementById("og_image").content =
    `${SUPABASE_URL}/storage/v1/object/public/previews/${toonId}_100.gif`;
  document.getElementById("og_url").content =
    `https://toonator.site/toon/${toonId}`;

  // Update toon info
  document.getElementById("toon_title").textContent = title;
  document.getElementById("toon_date").textContent = formatDate(
    toonData.created_at,
  );

  const authorLink = document.getElementById("author_link");
  authorLink.href = `/pages/profile.html?username=${encodeURIComponent(authorUsername)}`;
  authorLink.textContent = authorUsername;
  authorLink.className = `username foreign ${authorData.russian ? "russian" : ""}`;

  const avatarEl = document.getElementById("author_avatar");
  avatarEl.src = authorData.avatar;

  // Continued from
  if (toonData.continued_from) {
    const contInfo = await getContinuedFromInfo(toonData.continued_from);
    if (contInfo) {
      document.getElementById("continued_from").innerHTML = `
        <div style="font-size:9pt; margin-top:5px;">
          Original: <a href="/pages/toon.html?id=${contInfo.id}" class="noh" title="${contInfo.title} (${contInfo.author})">
            &#x25ce; ${escapeHTML(contInfo.title)}
          </a> by <a href="/pages/profile.html?username=${encodeURIComponent(contInfo.author)}" class="username foreign${contInfo.authorRussian ? " russian" : ""}">${escapeHTML(contInfo.author)}</a>
        </div>
      `;
    }
  }

  // Description
  if (description) {
    document.getElementById("description_text").textContent = description;
    document.getElementById("description_div").style.display = "block";
  }

  // Tags
  if (toonData.keywords) {
    const tagsHtml = toonData.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => `<a href="#" class="tag">${escapeHTML(k)}</a>`)
      .join(" ");

    if (tagsHtml) {
      document.getElementById("tags_container").innerHTML = tagsHtml;
      document.getElementById("tags_container").style.display = "block";
    }
  }

  // Share links
  const encodedTitle = encodeURIComponent(toonData.title || "Untitled");
  document.getElementById("share_twitter").href =
    `https://twitter.com/intent/tweet?url=https://toonator.site/toon/${toonId}&text=${encodedTitle}`;
  document.getElementById("share_reddit").href =
    `https://reddit.com/submit?url=https://toonator.site/toon/${toonId}&title=${encodedTitle}`;

  // Continue link
  document.getElementById("continue_link").href = `/draw/?continue=${toonId}`;

  // Initialize player
  const frames = Array.isArray(toonData.frames)
    ? toonData.frames
    : toonData.frames
      ? Object.values(toonData.frames)
      : [];
  const toonSettings = toonData.settings || {};

  if (window.initToonPlayer) {
    initToonPlayer("player_container", frames, toonSettings);
  }

  // Initialize components
  await initializeLikes(toonId);
  await loadComments(toonId);

  // Setup event handlers
  setupEventHandlers(toonId);
}

function setupEventHandlers(toonId) {
  // Like button
  const likeLink = document.getElementById("like_link");
  if (likeLink) {
    likeLink.onclick = (e) => {
      e.preventDefault();
      handleLike(toonId);
    };
  }

  // Favorite button
  const favLink = document.getElementById("favlink");
  if (favLink) {
    favLink.onclick = (e) => {
      e.preventDefault();
      handleFavorite();
    };
  }

  // Comment form
  const addCommentBtn = document.getElementById("addCommentBtn");
  if (addCommentBtn) {
    addCommentBtn.onclick = (e) => {
      e.preventDefault();
      showCommentForm();
    };
  }

  const postBtn = document.querySelector(
    'button[onclick*="postCommentHandler"]',
  );
  if (postBtn) {
    postBtn.onclick = (e) => {
      e.preventDefault();
      postCommentHandler(toonId);
    };
  }

  const cancelBtn = document.querySelector("button:last-of-type");
  if (cancelBtn) {
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      document.getElementById("comments_form").style.display = "none";
    };
  }
}
