// public/app.js
// Shared across all pages: a tiny fetch wrapper + localStorage session helpers.
window.Trend = (function () {
  const TOKEN_KEY = 'trend_token';
  const USER_KEY = 'trend_user';
  const THEME_KEY = 'trend_theme';

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
      toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      toggle.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const theme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(theme);

    const toggle = document.createElement('button');
    toggle.id = 'themeToggle';
    toggle.className = 'theme-toggle';
    toggle.type = 'button';
    setTheme(theme);
    const nav = document.querySelector('.nav-in');
    const avatar = document.getElementById('avatarBtn');
    if (nav && avatar) nav.insertBefore(toggle, avatar);
    else document.body.appendChild(toggle);
    setTheme(theme);

    toggle.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, nextTheme);
      setTheme(nextTheme);
    });
  }

  initTheme();
  import('/scroll.js').catch(() => {});

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function api(path, method = 'GET', body) {
    const headers = { 'content-type': 'application/json' };
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function requireAuthOrRedirect() {
    if (!getToken()) { location.href = 'login.html'; return false; }
    return true;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported in this browser.');
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notification permission was not granted.');
    const { publicKey } = await api('/api/push/vapid-public-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await api('/api/push/subscribe', 'POST', sub.toJSON());
    return true;
  }

  return { getToken, getUser, setSession, clearSession, api, requireAuthOrRedirect, enablePush };
})();
