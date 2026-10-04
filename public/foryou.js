// public/foryou.js
window.ForYou = (function () {
  let loaded = false;

  async function init() {
    const list = document.getElementById('foryouList');
    list.innerHTML = '<p style="color:var(--muted)">Loading your feed…</p>';
    try {
      const posts = await Trend.api('/api/posts?sort=foryou');
      Feed.renderPostsInto(list, posts, 'Nothing ranked yet — follow a few domains from your profile and post something.');
      loaded = true;
    } catch (e) {
      list.innerHTML = `<p style="color:var(--down)">${e.message}</p>`;
    }
  }

  return { init };
})();
