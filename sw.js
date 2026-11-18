// Vortex Competition service worker: Call Room phone alerts (Web Push).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Call Room', body: e.data ? e.data.text() : '' } }
  const title = d.title || 'Call Room'
  // Every call gets its own tag so iPhone always shows a new alert (never a silent replace).
  const tag = `${d.tag || 'vc-call'}-${d.stage || 0}-${Date.now()}`
  const opts = {
    body: d.body || '', tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || null, call: { title, body: d.body || '', stage: d.stage || 0, event_no: d.event_no, event: d.event, heat: d.heat } },
    requireInteraction: true,
    vibrate: d.stage === 3 ? [600, 200, 600, 200, 600, 200, 900] : [400, 150, 400, 150, 700],
  }
  e.waitUntil((async () => {
    let shown = 'full', err = ''
    try { await self.registration.showNotification(title, opts) }
    catch (x) {
      err = String(x && x.message || x); shown = 'minimal'
      try { await self.registration.showNotification(title, { body: opts.body, tag }) } catch (y) { shown = 'failed'; err += ' | ' + String(y && y.message || y) }
    }
    // Delivery receipt, so organizers can see that the phone got the alert.
    try { await fetch('https://qhrpwiakobgcxfmcoyfg.supabase.co/functions/v1/vc-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ack', tag: d.tag || '', stage: d.stage || 0, shown, err }) }) } catch { /* offline */ }
    // Also tell any open page, so it can show the call on screen.
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    all.forEach((c) => c.postMessage({ type: 'vc-call', title, body: d.body || '', stage: d.stage || 0, event_no: d.event_no, event: d.event, heat: d.heat }))
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const page = all.find((c) => c.url.includes('/s/'))
    const call = e.notification.data?.call
    if (page) { await page.focus(); if (call) page.postMessage({ type: 'vc-call', ...call, opened: true }); return }
    if (e.notification.data?.url) return self.clients.openWindow(e.notification.data.url)
  })())
})
