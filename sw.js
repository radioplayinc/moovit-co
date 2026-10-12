/* Moovit service worker — shows broker booking alerts. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { body: event.data.text() }; } catch (e2) {}
  }
  const title = data.title || 'New Moovit booking';
  const body = data.body || 'A new paid booking came in.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo.jpg',
      badge: '/logo.jpg',
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === self.registration.scope + url.replace(/^\//, '') || c.url.endsWith(url)) {
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
