import { useEffect, useState } from 'react'

// Notices when a newer version of the app has been published (open tabs and the
// installed web app otherwise keep running the old one) and offers a reload.
// Screens nobody touches (spectator TV, call room board) reload on their own.
const current = () => document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src')?.match(/index-[\w-]+\.js/)?.[0]

export default function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const mine = current()
    if (!mine) return undefined // dev server
    let stop = false
    async function check() {
      try {
        const html = await (await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })).text()
        const live = html.match(/index-[\w-]+\.js/)?.[0]
        if (!stop && live && live !== mine) {
          if (/^\/(tv|board)/.test(window.location.pathname)) window.location.reload()
          else setReady(true)
        }
      } catch { /* offline: try again later */ }
    }
    const t = setInterval(check, 60000)
    const onShow = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', check)
    check()
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', check) }
  }, [])
  if (!ready) return null
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1000, background: '#121236', color: '#fff', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 10px 30px rgba(18,18,54,.35)', fontSize: 14, maxWidth: 'calc(100vw - 32px)' }}>
      <span>A new version of the app is ready.</span>
      <button className="btn sm" onClick={() => window.location.reload()} style={{ background: '#fff', color: '#121236' }}>Reload now</button>
    </div>
  )
}
