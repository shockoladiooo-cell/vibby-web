/* Vibby PWA service worker: офлайн-кэш + Web Push. */
const CACHE = 'vibby-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const scope = self.registration.scope;
  const shell = [
    scope,
    scope + 'index.html',
    scope + 'manifest.json',
    scope + 'icons/Icon-192.png',
    scope + 'icons/Icon-512.png',
    scope + 'favicon.png',
  ];
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(shell))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* Сеть в приоритете: обновления Flutter подхватываются сразу.
   Кэш используется только когда сети нет. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = self.registration.scope;
  if (!url.href.startsWith(scope)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const index = await caches.match(scope + 'index.html');
          if (index) return index;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Vibby';
  const body = data.body || '';
  const chat = data.chat || '';
  const call = data.call === true || data.call === '1';
  const scope = self.registration.scope;
  const options = {
    body,
    icon: scope + 'icons/Icon-192.png',
    badge: scope + 'icons/Icon-192.png',
    tag: call
      ? 'vibby-call-' + (chat || 'unknown')
      : chat
        ? 'vibby-' + chat
        : 'vibby',
    renotify: true,
    requireInteraction: call,
    silent: false,
    vibrate: call ? [300, 150, 300, 150, 300, 150, 300] : [120, 60, 120],
    data: {
      chat,
      call,
      url: scope + (chat ? '?chat=' + encodeURIComponent(chat) : ''),
    },
  };
  event.waitUntil(
    (async () => {
      // Если PWA открыта на переднем плане, входящий звонок уже показывает
      // собственный экран приложения — системное уведомление не дублируем.
      if (call) {
        const all = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        if (all.some((c) => c.focused || c.visibilityState === 'visible')) {
          return;
        }
      }
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chat = data.chat || '';
  const scope = self.registration.scope;
  const target = scope + (chat ? '?chat=' + encodeURIComponent(chat) : '');
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.startsWith(scope)) {
          await client.focus();
          if (chat) {
            try {
              await client.navigate(target);
            } catch (_) {}
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
