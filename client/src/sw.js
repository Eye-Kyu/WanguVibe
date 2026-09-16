// Hand-written service worker (injectManifest mode — see vite.config.js for
// why: a `push` event listener can only live in custom SW code, and the
// previously-used generateSW mode has no hook for one).
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);

// Same rule generateSW used to wire up automatically: live data first, last
// cached response when offline. Matched by pathname only (not sameOrigin)
// since the API is on a different origin from the client in every real
// deployment.
registerRoute(
  ({ url }) => url.pathname.endsWith('/api/styles'),
  new NetworkFirst({ cacheName: 'styles-api', networkTimeoutSeconds: 5 })
);

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const { title, body, tag, data } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'Wanguvibe POS', {
      body,
      tag,
      data,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  );
});

// Clicking a notification focuses an already-open tab on the relevant admin
// page if one exists, otherwise opens a new one — rather than always
// spawning a new tab even when the app is already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
