// Vortex Competition service worker: Call Room phone alerts (Web Push).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Call Room', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Call Room', {
    body: d.body || '',
    tag: d.tag || 'vc-call',
    renotify: true,
    requireInteraction: true,
    vibrate: d.stage === 3 ? [600, 200, 600, 200, 600, 200, 900] : [400, 150, 400, 150, 700],
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || null },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const page = all.find((c) => c.url.includes('/s/'))
    if (page) return page.focus()
    if (e.notification.data?.url) return self.clients.openWindow(e.notification.data.url)
  })())
})
