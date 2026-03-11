// Profile Page Controller - Main logic for profile page
import {
  getProfileByUsername,
  getProfileStats,
  getUserToons,
  getUserFavorites,
  getUserCommentedToons,
  loadIncludes,
  updateUserAvatar,
} from "/js/api.js";
import {
  renderPaginator,
  calculateTotalPages,
  getCurrentPageFromURL,
} from "/js/paginator.js";
import { db } from "/js/config.js";

const PER_PAGE = 12;
let currentUsername = "";
let currentPage = 1;
let currentTab = "album";

export async function initProfile(username) {
  currentUsername = username;
  currentPage = getCurrentPageFromURL();

  // Load includes (header, footer, modal)
  const { header, footer, donate, modal } = await loadIncludes();
  if (header) document.getElementById("header_placeholder").innerHTML = header;
  if (footer) document.getElementById("footer_placeholder").innerHTML = footer;
  if (donate) document.getElementById("donate_placeholder").innerHTML = donate;
  if (modal) document.body.insertAdjacentHTML("beforeend", modal);
  if (window.updateAuthUI) updateAuthUI();

  // Load profile data
  const { profile } = await getProfileByUsername(username);
  if (!profile) {
    document.getElementById("toons_list").innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px 0;">User not found.</p>';
    document.getElementById("stat_toons").textContent = "0";
    return;
  }

  // Update page title
  document.getElementById("page_title").textContent = `${username} - Toonator`;
  document.getElementById("profile_username_wrap").href =
    `/pages/profile.html?username=${encodeURIComponent(username)}`;
  document.getElementById("profile_username").textContent = username;

  // Load stats
  const userId = profile.id;
  const { totalToons, draftCount, commentCount } =
    await getProfileStats(userId);
  document.getElementById("stat_toons").textContent = totalToons;
  document.getElementById("stat_comments").textContent = commentCount;

  // Check if own profile
  const {
    data: { user: currentUser },
  } = await db.auth.getUser();
  const isOwnProfile =
    currentUser && currentUser.user_metadata?.username === username;

  // Set avatar
  const avatarEl = document.getElementById("profile_avatar");
  const avatarToon = isOwnProfile
    ? currentUser?.user_metadata?.avatar_toon || profile.avatar_toon
    : profile.avatar_toon;

  if (avatarToon) {
    avatarEl.src = `https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${avatarToon}_100.gif`;
  }
  avatarEl.onerror = () => {
    avatarEl.src = "/img/avatar100.gif";
  };

  // Show change avatar option if own profile
  if (isOwnProfile) {
    avatarEl.insertAdjacentHTML(
      "afterend",
      '<br/><a href="#" onclick="changeAvatar(); return false;" style="font-size:9pt;">[Change avatar]</a>',
    );
    document.getElementById("stat_drafts_row").style.display = "";
    document.getElementById("stat_drafts").textContent = draftCount;
  }

  // Show private messages link if viewing another profile and logged in
  if (currentUser && !isOwnProfile) {
    const pmLink = document.getElementById("private_messages_link");
    pmLink.href = `/messages/${username}/`;
    pmLink.style.display = "";
  }

  // Setup tab switching
  setupTabSwitching(userId, totalToons);

  // Load initial view (Album)
  await loadAlbumView(userId);

  // Setup global function for changing avatar
  window.changeAvatar = async function () {
    const toonId = prompt("Enter toon ID to use as avatar:");
    if (!toonId) return;

    const { success, error } = await updateUserAvatar(username, toonId);
    if (success) {
      document.getElementById("profile_avatar").src =
        `https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${toonId}_100.gif`;
    } else {
      alert("Error saving avatar: " + (error?.message || "Unknown error"));
    }
  };
}

function setupTabSwitching(userId, totalToons) {
  const tabContainer = document.querySelector(".nmenu").parentElement;
  const tabs = tabContainer.querySelectorAll(".nmenu");

  tabs.forEach((tab) => {
    tab.addEventListener("click", async (e) => {
      e.preventDefault();

      // Update active tab
      tabs.forEach((t) => t.classList.remove("selected"));
      tab.classList.add("selected");

      // Determine which tab was clicked
      const tabText = tab.textContent.toLowerCase();

      if (tabText.includes("album")) {
        currentTab = "album";
        await loadAlbumView(userId, totalToons);
      } else if (tabText.includes("favorites")) {
        currentTab = "favorites";
        await loadFavoritesView(userId);
      } else if (tabText.includes("comments")) {
        currentTab = "comments";
        await loadCommentsView(userId);
      }
    });
  });
}

async function loadAlbumView(userId, totalToons) {
  const { toons, commentCounts } = await getUserToons(userId, 1, PER_PAGE);
  renderToons(toons, commentCounts);
  renderPaginator(
    calculateTotalPages(totalToons, PER_PAGE),
    currentUsername,
    1,
    "paginator_top",
  );
  renderPaginator(
    calculateTotalPages(totalToons, PER_PAGE),
    currentUsername,
    1,
    "paginator_bottom",
  );
}

async function loadFavoritesView(userId) {
  const { toons, commentCounts } = await getUserFavorites(userId, 1, PER_PAGE);
  if (toons.length === 0) {
    document.getElementById("toons_list").innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px 0;">No favorites yet.</p>';
    document.getElementById("paginator_top").innerHTML = "";
    document.getElementById("paginator_bottom").innerHTML = "";
    return;
  }
  renderToons(toons, commentCounts);
  document.getElementById("paginator_top").innerHTML = "";
  document.getElementById("paginator_bottom").innerHTML = "";
}

async function loadCommentsView(userId) {
  const { toons, commentCounts } = await getUserCommentedToons(
    userId,
    1,
    PER_PAGE,
  );
  if (toons.length === 0) {
    document.getElementById("toons_list").innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px 0;">No commented toons yet.</p>';
    document.getElementById("paginator_top").innerHTML = "";
    document.getElementById("paginator_bottom").innerHTML = "";
    return;
  }
  renderToons(toons, commentCounts);
  document.getElementById("paginator_top").innerHTML = "";
  document.getElementById("paginator_bottom").innerHTML = "";
}

function renderToons(toons, commentCounts) {
  const list = document.getElementById("toons_list");
  if (toons.length === 0) {
    list.innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px 0;">No toons yet.</p>';
    return;
  }

  list.innerHTML = toons
    .map((toon) => {
      const frames = Array.isArray(toon.frames)
        ? toon.frames
        : toon.frames
          ? Object.values(toon.frames)
          : [];
      const frameCount = frames.length || 1;
      const title = toon.title || "Untitled";
      const frameLabel =
        frameCount === 1 ? "1 frame" : `<b>${frameCount}</b> frames`;
      const cc = commentCounts[toon.id] || 0;
      const commentLabel =
        cc === 0
          ? '<span class="grayb">No comments</span>'
          : `<b>${cc}</b> comment${cc === 1 ? "" : "s"}`;

      return `<div class="toon_preview toon_preview_${toon.id}">
        <div class="toon_image"><a href="/pages/toon.html?id=${toon.id}" title="${title}">
          <img src="https://ytyhhmwnnlkhhpvsurlm.supabase.co/storage/v1/object/public/previews/${toon.id}_100.gif" width="200" height="100" alt="${title}" onerror="this.src='/img/avatar100.gif'"/>
        </a></div>
        <div class="toon_name"><a class="link" href="/pages/toon.html?id=${toon.id}">${title}</a></div>
        <div class="toon_tagline">${frameLabel}</div>
        <div class="toon_tagline">${commentLabel}</div>
      </div>`;
    })
    .join("");
}
