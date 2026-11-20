// SIV-Estadio Service Worker for PWA & Native Push Notifications
const CACHE_NAME = 'siv-estadio-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming native push notifications
self.addEventListener('push', (event) => {
  let data = {
    title: '⚠️ Alerta de Seguridad SIV-Estadio',
    body: 'Se ha detectado un evento anómalo en el recinto.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'siv-alert',
    url: '/alerts',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'siv-alert',
    data: { url: data.url || '/alerts' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'view', title: 'Ver Alerta' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click on notification opens or focuses the alerts console
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/alerts';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
