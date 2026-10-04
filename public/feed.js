// public/feed.js — Instagram-style post cards, media uploads, double-tap-to-invite voting
window.Feed = (function () {
  let currentDomain = "all";
  let currentUser = null;
  let currentUserAvatar = null;
  let pendingMedia = null; // { dataUrl, kind: 'image'|'video' }

  const U = (id) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;
  const IMG = {
    tech: U("1758549885423-819fd86e04f0"),
    music: U("1684086974807-b677f2165cb9"),
    fashion: U("1637228393246-c38a4b3d2011"),
    finance:
      "https://images.pexels.com/photos/5831511/pexels-photo-5831511.jpeg?auto=compress&cs=tinysrgb&w=900",
    health: U("1664813495783-a7b19be83624"),
  };
  const AV_COLORS = [
    "#1A56FF",
    "#6D4AFF",
    "#D6336C",
    "#0A8F7F",
    "#D9480F",
    "#B76E00",
  ];
  const MAX_POST_WORDS = 1000;
  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++)
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }
  function domainLabel(d) {
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  function escapeHtml(s) {
    return s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
  }

  function countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  const HEART_OUTLINE =
    '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.3 8.2 2 4.8 5.4 4.2c2-.35 3.9.5 5 2.1 1.1-1.6 3-2.45 5-2.1C18.8 4.8 20.5 8.2 19 11.7 16.5 16.4 12 21 12 21Z"/></svg>';
  const HEART_FILL =
    '<svg viewBox="0 0 24 24" fill="#ED4956" stroke="#ED4956"><path d="M12 21s-7.5-4.6-10-9.3C.3 8.2 2 4.8 5.4 4.2c2-.35 3.9.5 5 2.1 1.1-1.6 3-2.45 5-2.1C18.8 4.8 20.5 8.2 19 11.7 16.5 16.4 12 21 12 21Z"/></svg>';
  const COMMENT_ICON =
    '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>';
  const SHARE_ICON =
    '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>';

  function generatedPostImage(post) {
    const description = String(post.text || "").replace(/\s+/g, " ").slice(0, 420);
    const prompt = `Editorial photograph for a ${post.domain} post: ${description}. No lettering or text.`;
    const seed = String(post.id).split("").reduce(
      (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
      0,
    );
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=900&height=1100&seed=${seed}&model=flux&nologo=true`;
  }

  function imageForPost(post) {
    return post.mediaUrl && post.mediaType !== "video"
      ? post.mediaUrl
      : generatedPostImage(post);
  }

  function fallbackImageForPost(post) {
    return `https://picsum.photos/seed/${encodeURIComponent(String(post.id))}/900/1100`;
  }

  // ---------- media rendering for a post ----------
  function mediaBlock(p) {
    if (p.mediaUrl && p.mediaType === "video") {
      return `<video class="post-media" src="${p.mediaUrl}" controls playsinline></video>`;
    }
    const src = p.mediaUrl || generatedPostImage(p);
    const isGenerated = p.mediaGenerated || !p.mediaUrl;
    const fallback = isGenerated ? fallbackImageForPost(p) : IMG[p.domain];
    return `<img class="post-media" src="${escapeHtml(src)}" data-fallback="${escapeHtml(fallback)}" alt="${domainLabel(p.domain)}" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback&&!this.dataset.failed){this.dataset.failed='1';this.src=this.dataset.fallback}else{this.style.display='none'}">`;
  }

  function postCard(p) {
    const voted = p.myVote !== null;
    const authorAvatar = p.authorAvatar ||
      (p.authorName === currentUser?.name ? currentUserAvatar : null);
    const voteHtml =
      p.type === "claim"
        ? `<div class="vote${voted ? " done mine-" + p.myVote : ""}" data-id="${p.id}" style="--t:${p.truePct};--f:${100 - p.truePct}">
           <button class="bt" data-v="true">True${voted ? ` · ${p.truePct}%` : ""}</button>
           <button class="bf" data-v="false">False${voted ? ` · ${100 - p.truePct}%` : ""}</button>
         </div>`
        : "";
    return `<article class="post" data-id="${p.id}" data-voted="${voted ? "1" : ""}">
      <div class="ig-head">
        <div class="ig-av" style="background:${avatarColor(p.authorName)}">${authorAvatar ? `<img src="${escapeHtml(authorAvatar)}" alt="" loading="lazy" onerror="this.remove()">` : p.authorName.slice(0, 1).toUpperCase()}</div>
        <div class="ig-who"><b>@${escapeHtml(p.authorName)}</b><span>${timeAgo(p.createdAt)} ago</span></div>
        <span class="tag ${p.domain}">${domainLabel(p.domain)}</span>
        <span class="kind">${p.type}</span>
      </div>
      <div class="ig-img" data-dbltap>
        ${mediaBlock(p)}
        <div class="ig-heart-burst">${HEART_FILL}</div>
      </div>
      <div class="ig-actions">
        <button class="heart ${p.myReacted ? "on" : ""}" data-a="react">${p.myReacted ? HEART_FILL : HEART_OUTLINE}</button>
        <button data-a="comments">${COMMENT_ICON}</button>
        <button data-a="share">${SHARE_ICON}</button>
      </div>
      <div class="ig-likes" data-reacts-line>${p.reacts > 0 ? `${p.reacts} like${p.reacts === 1 ? "" : "s"}` : "Be the first to like this"}</div>
      <div class="ig-cap"><b>@${escapeHtml(p.authorName)}</b>${escapeHtml(p.text)}</div>
      ${voteHtml}
      ${p.type === "claim" ? `<div class="ig-viewcomments" style="cursor:default;color:var(--muted)">${p.totalVotes} votes · tap to vote, tap again to remove it, double-tap to invite someone</div>` : ""}
      <button class="ig-viewcomments" data-a="comments-link">${p.commentCount ? `View all ${p.commentCount} comments` : "Add a comment"}</button>
      <div class="comments" data-comments></div>
    </article>`;
  }

  async function loadFeed() {
    const list = document.getElementById("feedList");
    list.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try {
      const posts = await Trend.api(`/api/posts?domain=${currentDomain}`);
      list.innerHTML = posts.length
        ? posts.map(postCard).join("")
        : '<p style="color:var(--muted)">Nothing here yet — be the first to post.</p>';
      wireAll();
    } catch (e) {
      list.innerHTML = `<p style="color:var(--down)">${e.message}</p>`;
    }
  }

  function renderCommentTree(list) {
    const top = list.filter((c) => !c.parentId);
    const byParent = {};
    list
      .filter((c) => c.parentId)
      .forEach((c) => {
        (byParent[c.parentId] ||= []).push(c);
      });

    const row = (
      c,
      isReply,
    ) => `<div class="comment" style="${isReply ? "margin-left:28px;padding-top:6px" : ""}">
      <b>@${escapeHtml(c.authorName)}</b>${escapeHtml(c.text)}
      ${!isReply ? `<button class="reply-btn" data-reply-to="${c.id}" data-reply-name="${escapeHtml(c.authorName)}">Reply</button>` : ""}
    </div>`;

    return (
      top
        .map(
          (c) =>
            row(c, false) +
            (byParent[c.id] || []).map((r) => row(r, true)).join(""),
        )
        .join("") ||
      '<p style="color:var(--muted);font-size:13px">No comments yet.</p>'
    );
  }

  async function toggleComments(postId, panel) {
    if (panel.classList.contains("open")) {
      panel.classList.remove("open");
      return;
    }
    panel.classList.add("open");
    panel.innerHTML =
      '<p style="color:var(--muted);font-size:13px">Loading…</p>';
    const list = await Trend.api(`/api/posts/${postId}/comments`);
    panel.innerHTML =
      renderCommentTree(list) +
      `<div class="comment-form" data-reply-target="">
           <span class="reply-hint" style="display:none"></span>
           <input placeholder="Add a comment…" data-comment-input>
           <button data-comment-send>Post</button>
         </div>`;
  }

  async function doReact(id, card) {
    try {
      const updated = await Trend.api(`/api/posts/${id}/react`, "POST");
      card.outerHTML = postCard(updated);
      wireAll();
    } catch (e) {
      /* already reacted or logged out — ignore quietly for double-tap */
    }
  }

  // ---------- invite popover (double-tap a True/False button) ----------
  function closeInvitePop() {
    document.querySelectorAll(".invite-pop").forEach((el) => el.remove());
  }
  function openInvitePop(btn, postId, choice) {
    closeInvitePop();
    const link = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}app.html?post=${postId}&invite=${choice}`;
    const pop = document.createElement("div");
    pop.className = "invite-pop";
    pop.innerHTML = `
      <div class="it">Invite someone to vote ${choice === "true" ? "True" : "False"}</div>
      <div class="row">
        <input readonly value="${link}">
        <button type="button">Copy</button>
      </div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 250)}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
    requestAnimationFrame(() => pop.classList.add("show"));

    pop.querySelector("button").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        showToast("Invite link copied.");
      } catch {
        showToast("Copy this link: " + link);
      }
      closeInvitePop();
    });
    setTimeout(
      () =>
        document.addEventListener("click", function onDoc(e) {
          if (!pop.contains(e.target)) {
            closeInvitePop();
            document.removeEventListener("click", onDoc);
          }
        }),
      0,
    );
  }

  function wireVoteButtons(card) {
    const id = card.dataset.id;
    const lastTapByBtn = new WeakMap();

    card.querySelectorAll(".vote button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const now = Date.now();
        const last = lastTapByBtn.get(btn) || 0;
        lastTapByBtn.set(btn, now);

        // double tap -> invite, regardless of whether this post was already voted on
        if (now - last < 350) {
          openInvitePop(btn, id, btn.dataset.v);
          return;
        }

        // single tap -> cast, change, or retract the vote (server decides which)
        try {
          const updated = await Trend.api(`/api/posts/${id}/vote`, "POST", {
            choice: btn.dataset.v,
          });
          card.outerHTML = postCard(updated);
          wireAll();
        } catch (e) {
          showToast(e.message);
        }
      });
    });
  }

  function wireCard(card) {
    const id = card.dataset.id;

    wireVoteButtons(card);
    card
      .querySelector('[data-a="react"]')
      .addEventListener("click", () => doReact(id, card));
    card
      .querySelector('[data-a="share"]')
      .addEventListener("click", () => showToast("Link copied. (Demo only.)"));
    card
      .querySelector('[data-a="comments"]')
      .addEventListener("click", () =>
        toggleComments(id, card.querySelector("[data-comments]")),
      );
    card
      .querySelector('[data-a="comments-link"]')
      .addEventListener("click", () =>
        toggleComments(id, card.querySelector("[data-comments]")),
      );

    const img = card.querySelector("[data-dbltap]");
    const media = img.querySelector(".post-media");
    const updateMediaRatio = () => {
      const width = media.videoWidth || media.naturalWidth;
      const height = media.videoHeight || media.naturalHeight;
      if (!width || !height) return;
      img.style.aspectRatio = `${Math.min(1.91, Math.max(0.8, width / height))}`;
    };
    media.addEventListener("load", updateMediaRatio);
    media.addEventListener("loadedmetadata", updateMediaRatio);
    if (media.complete || media.readyState >= 1) updateMediaRatio();
    let lastTap = 0;
    img.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTap < 350) {
        const burst = img.querySelector(".ig-heart-burst");
        burst.classList.remove("pop");
        void burst.offsetWidth;
        burst.classList.add("pop");
        if (!card.querySelector(".heart").classList.contains("on"))
          doReact(id, card);
      }
      lastTap = now;
    });

    card.addEventListener("click", async (e) => {
      if (e.target.matches(".reply-btn")) {
        const form = card.querySelector(".comment-form");
        form.dataset.replyTarget = e.target.dataset.replyTo;
        const hint = form.querySelector(".reply-hint");
        hint.textContent = `Replying to @${e.target.dataset.replyName} · `;
        hint.style.display = "inline";
        card.querySelector("[data-comment-input]").focus();
        return;
      }
      if (e.target.matches("[data-comment-send]")) {
        const input = card.querySelector("[data-comment-input]");
        const form = card.querySelector(".comment-form");
        const text = input.value.trim();
        if (!text) return;
        try {
          await Trend.api(`/api/posts/${id}/comments`, "POST", {
            text,
            parentId: form.dataset.replyTarget || undefined,
          });
          const countBtn = card.querySelector('[data-a="comments-link"]');
          const n =
            parseInt(countBtn.textContent.match(/\d+/)?.[0] || "0", 10) + 1;
          countBtn.textContent = `View all ${n} comments`;
          input.value = "";
          const panel = card.querySelector("[data-comments]");
          panel.classList.remove("open");
          toggleComments(id, panel);
        } catch (err) {
          showToast(err.message);
        }
      }
    });
  }

  function wireAll() {
    document.querySelectorAll("#feedList .post").forEach(wireCard);
  }

  // ---------- composer media picker ----------
  const MAX_MEDIA_BYTES = 4.5 * 1024 * 1024; // keep JSON-file DB sane for a prototype

  function wireComposerMedia() {
    const input = document.getElementById("mediaInput");
    const preview = document.getElementById("mediaPreview");
    const imgEl = document.getElementById("mediaPreviewImg");
    const vidEl = document.getElementById("mediaPreviewVid");
    const removeBtn = document.getElementById("mediaRemove");
    if (!input) return; // composer not on this page

    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > MAX_MEDIA_BYTES) {
        showToast(
          "That file is too big for this demo (max ~4.5MB). Pick a smaller one.",
        );
        input.value = "";
        return;
      }
      const kind = file.type.startsWith("video") ? "video" : "image";
      const reader = new FileReader();
      reader.onload = () => {
        pendingMedia = { dataUrl: reader.result, kind };
        preview.style.display = "block";
        if (kind === "video") {
          vidEl.src = reader.result;
          vidEl.style.display = "block";
          imgEl.style.display = "none";
        } else {
          imgEl.src = reader.result;
          imgEl.style.display = "block";
          vidEl.style.display = "none";
        }
      };
      reader.readAsDataURL(file);
    });

    removeBtn.addEventListener("click", () => {
      pendingMedia = null;
      input.value = "";
      preview.style.display = "none";
      imgEl.style.display = "none";
      vidEl.style.display = "none";
    });
  }

  function init(user = null) {
    currentUser = user;
    currentUserAvatar = null;
    const avatarMatch = user?.avatarUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (avatarMatch) {
      const binary = atob(avatarMatch[2]);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      currentUserAvatar = URL.createObjectURL(new Blob([bytes], { type: avatarMatch[1] }));
    }

    const postText = document.getElementById("postText");
    const wordCount = document.getElementById("postWordCount");
    const updateWordCount = () => {
      const words = postText.value.trim().split(/\s+/).filter(Boolean);
      if (words.length > MAX_POST_WORDS) {
        postText.value = words.slice(0, MAX_POST_WORDS).join(" ");
        showToast("Posts are limited to 1,000 words.");
      }
      wordCount.textContent = `${countWords(postText.value)} / 1,000 words`;
    };
    postText.addEventListener("input", updateWordCount);
    updateWordCount();

    document.getElementById("filters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document
        .querySelectorAll("#filters .chip")
        .forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      currentDomain = chip.dataset.domain;
      loadFeed();
    });

    wireComposerMedia();

    document.getElementById("postBtn").addEventListener("click", async () => {
      const text = document.getElementById("postText").value.trim();
      if (!text) return showToast("Write something first.");
      try {
        await Trend.api("/api/posts", "POST", {
          domain: document.getElementById("postDomain").value,
          type: document.getElementById("postType").value,
          text,
          mediaUrl: pendingMedia ? pendingMedia.dataUrl : undefined,
          mediaType: pendingMedia ? pendingMedia.kind : undefined,
        });
        document.getElementById("postText").value = "";
        document.getElementById("mediaRemove").click();
        currentDomain = "all";
        document
          .querySelectorAll("#filters .chip")
          .forEach((c) => c.classList.toggle("on", c.dataset.domain === "all"));
        await loadFeed();
        showToast("Posted.");
      } catch (e) {
        showToast(e.message);
      }
    });

    loadFeed();
  }

  function renderPostsInto(container, posts, emptyMessage) {
    container.innerHTML = posts.length
      ? posts.map(postCard).join("")
      : `<p style="color:var(--muted)">${emptyMessage || "Nothing here yet."}</p>`;
    container.querySelectorAll(".post").forEach(wireCard);
  }

  return { init, IMG, domainLabel, escapeHtml, avatarColor, imageForPost, fallbackImageForPost, renderPostsInto };
})();
