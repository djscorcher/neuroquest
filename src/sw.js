import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Injected by vite-plugin-pwa — the precache manifest for the app shell.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control of all clients immediately on activation.
self.skipWaiting();
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// SPA navigation fallback — all nav requests serve index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Supabase REST API (GET only) → NetworkFirst with short cache fallback.
// Auth endpoints excluded — never cache tokens.
registerRoute(
  ({ url, request }) =>
    url.hostname.endsWith('.supabase.co') &&
    !url.pathname.startsWith('/auth') &&
    request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 300, maxEntries: 50 })],
  })
);

// GitHub raw audio (music tracks) → CacheFirst — static, large, rarely changes.
registerRoute(
  ({ url }) => url.hostname === 'raw.githubusercontent.com',
  new CacheFirst({
    cacheName: 'audio-tracks',
    plugins: [new ExpirationPlugin({ maxEntries: 20 })],
  })
);

// ── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  const { title = 'NeuroQuest', body = '', tag = 'nq', url = '/' } = data;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon:  '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data:  { url },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/';
  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const existing = clients.find(c => c.url === url && 'focus' in c);
        return existing ? existing.focus() : self.clients.openWindow(url);
      })
  );
});
