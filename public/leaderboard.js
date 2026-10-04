// public/leaderboard.js
window.Leaderboard = (function () {
  let period = 'week';

  async function load() {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try {
      const posts = await Trend.api(`/api/leaderboard?period=${period}`);
      Feed.renderPostsInto(list, posts, 'No claims with votes in this period yet.');
    } catch (e) {
      list.innerHTML = `<p style="color:var(--down)">${e.message}</p>`;
    }
  }

  function init() {
    if (!document.getElementById('lbFilters').dataset.wired) {
      document.getElementById('lbFilters').dataset.wired = '1';
      document.getElementById('lbFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        document.querySelectorAll('#lbFilters .chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        period = chip.dataset.period;
        load();
      });
    }
    load();
  }

  return { init };
})();
