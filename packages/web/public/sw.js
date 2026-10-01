/* eslint-disable no-restricted-globals */

// Taskflow's service worker: keeps the app shell available offline and shows
// push notifications. API requests are never cached here; the app keeps its
// own copy of the data it has shown (IndexedDB).

const SHELL_CACHE = 'taskflow-shell-v1';
const ASSET_CACHE = 'taskflow-assets-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/favicon-32.png'];

// ── App shell ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL);
      // The built scripts and styles the page itself loads, so the very
      // first visit is enough to work offline afterwards.
      const html = await (await cache.match('/')).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      if (assets.length) await (await caches.open(ASSET_CACHE)).addAll(assets);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith('taskflow-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // Pages: the network first, so a deploy shows up at once; the cached shell
  // when offline. Every route is the same single-page app.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) (await caches.open(SHELL_CACHE)).put('/', fresh.clone());
          return fresh;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Built assets have content hashes in their names, so a cached copy is
  // always right. Lazy chunks are cached the first time they load.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) (await caches.open(ASSET_CACHE)).put(request, fresh.clone());
        return fresh;
      })(),
    );
  }
});

// ── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'Taskflow', body: 'You have a new notification' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: data.data?.taskId || 'taskflow-notification',
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  let url = '/today';

  if (data.taskId) {
    url = data.projectId ? `/projects/${data.projectId}?task=${data.taskId}` : '/today';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
