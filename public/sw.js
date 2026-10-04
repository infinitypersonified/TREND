// public/sw.js
// Minimal real service worker for Web Push. Registered by main.js/profile.html
// when the user clicks "Enable notifications".

self.addEventListener('push', (event) => {
  let data = { title: 'Trend', body: 'You have a new notification.', url: '/app.html' };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* non-JSON payload, use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      data: { url: data.url || '/app.html' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app.html';
  event.waitUntil(clients.openWindow(url));
});
