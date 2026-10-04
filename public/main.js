// public/main.js
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

(async function boot() {
  if (!Trend.requireAuthOrRedirect()) return;
  let me;
  try {
    me = await Trend.api('/api/me');
  } catch (e) {
    Trend.clearSession();
    location.href = 'login.html';
    return;
  }
  const user = Trend.getUser();
  document.getElementById('avatarBtn').textContent = (user?.name || '?').slice(0, 1).toUpperCase();

  // tabs
  const tabs = document.getElementById('tabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    const names = ['feed', 'foryou', 'leaderboard', 'markets', 'chat'];
    names.forEach((t) => {
      document.getElementById(`tab-${t}`).style.display = t === btn.dataset.tab ? 'block' : 'none';
    });
    if (btn.dataset.tab === 'markets' && window.Markets) window.Markets.init();
    if (btn.dataset.tab === 'foryou' && window.ForYou) window.ForYou.init();
    if (btn.dataset.tab === 'leaderboard' && window.Leaderboard) window.Leaderboard.init();
  });

  document.getElementById('avatarBtn').addEventListener('click', () => { location.href = 'profile.html'; });

  window.Feed.init(me);
  window.Chat.init();

  const wanted = location.hash.replace('#', '');
  if (['feed', 'foryou', 'leaderboard', 'markets', 'chat'].includes(wanted)) {
    document.querySelector(`[data-tab="${wanted}"]`)?.click();
  }
})();
