// Comments Component - Handles toon comments
import { getToonComments, postComment, escapeHTML } from "/js/api.js";
import { db } from "/js/config.js";

export async function loadComments(toonId) {
  const comments = await getToonComments(toonId);
  const list = document.getElementById("comments_list");

  if (comments.length === 0) {
    list.innerHTML =
      '<p style="color:#888888;font-size:10pt;padding:10px;">No comments yet.</p>';
    return;
  }

  list.innerHTML = comments
    .map((c) => {
      const username = escapeHTML(c.author_username || "anonymous");
      const ud = c.userData || {
        avatar: "/img/avatar100.gif",
        russian: false,
      };
      const date = new Date(c.created_at);
      const dateStr =
        date.toLocaleDateString("en-US") +
        " " +
        date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
      const commentText = escapeHTML(c.text);

      return `<div class="comment">
        <div class="avatar">
          <a href="/pages/profile.html?username=${encodeURIComponent(username)}"><img class="avatar" src="${escapeHTML(ud.avatar)}" onerror="this.src='/img/avatar100.gif'"/></a>
        </div>
        <div class="head">
          <a href="/pages/profile.html?username=${encodeURIComponent(username)}" class="username foreign${ud.russian ? " russian" : ""}">${username}</a>
          <span class="date"><b>${dateStr}</b></span>
        </div>
        <div class="text">${commentText}</div>
      </div>`;
    })
    .join("");
}

export async function showCommentForm() {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    if (window.showAuth) showAuth("login");
    return;
  }
  document.getElementById("comments_form").style.display = "block";
  document.getElementById("comment_text").focus();
}

export async function postCommentHandler(toonId) {
  const text = document.getElementById("comment_text").value.trim();
  if (!text) return;

  const { error } = await postComment(toonId, text);
  if (!error) {
    document.getElementById("comment_text").value = "";
    document.getElementById("comments_form").style.display = "none";
    await loadComments(toonId);
  } else {
    alert("Error posting comment: " + error.message);
  }
}
