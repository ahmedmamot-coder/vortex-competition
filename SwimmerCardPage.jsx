import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'
import { speechForHeat } from './lib.js'

// Public page opened from the QR code on a swimmer's pass: the swimmer's events,
// heats and lanes from this system, and a link to their results on the VIC results site.
// No photo and no contact details are shown here.
const PUSH_URL = 'https://qhrpwiakobgcxfmcoyfg.supabase.co/functions/v1/vc-push'
const STAGE = { 1: 'First Call', 2: 'Second Call', 3: 'In Call', 4: 'At the blocks' }
const pretty = (n) => (n && n.includes(',') ? `${n.split(',').slice(1).join(',').trim()} ${n.split(',')[0].trim()}` : n || '')

export default function SwimmerCardPage() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { setStatus('missing'); return }
    let stop = false
    const load = () => supabase.rpc('vc_swimmer_card', { p_id: id }).then(({ data, error }) => {
      if (stop) return
      if (error) setStatus((s) => (s === 'ok' ? s : 'error'))
      else if (!data) setStatus('missing')
      else { setD(data); setStatus('ok') }
    })
    load()
    const t = setInterval(load, 20000) // keep the call status fresh while the page is open
    return () => { stop = true; clearInterval(t) }
  }, [id])

  const heats = d?.heats || []
  const entries = d?.entries || []
  const live = heats.filter((h) => !h.scratched && h.stage >= 1 && h.stage <= 3)
  const liveKey = live.map((h) => `${h.event_no}-${h.heat}-${h.stage}`).join('|')
  useEffect(() => { live.forEach((h) => speakCall({ event_no: h.event_no, event: h.event, heat: h.heat, stage: h.stage })) }, [liveKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="vx-page">
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-page" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <img src={logoH} alt="Vortex International Championships 2026" style={{ height: 54, alignSelf: 'flex-start' }} />
        </div>
      </header>
      <div className="form-page">
        {status === 'loading' && <div className="empty">Loading…</div>}
        {status === 'missing' && <div className="notice">This swimmer is not in the current competition.</div>}
        {status === 'error' && <div className="notice error">Could not load this page. Check the internet connection and try again.</div>}
        {status === 'ok' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {d.logo && <img src={d.logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)', background: '#fff', padding: 4 }} />}
              <div>
                <div className="eyebrow blue">{d.club}</div>
                <h1 style={{ fontSize: 26, margin: '2px 0 4px' }}>{pretty(d.name)}</h1>
                <div className="small muted">{[d.gender === 'F' ? 'Female' : d.gender === 'M' ? 'Male' : null, d.age ? `Age ${d.age}` : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="small muted">{[d.meet?.name, d.meet?.venue, d.meet?.date].filter(Boolean).join(' · ')}</div>

            {live.map((h, i) => (
              <div key={i} role="status" style={{ background: h.stage === 3 ? '#b4461a' : '#1f23c9', color: '#fff', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{STAGE[h.stage]}</div>
                <div style={{ fontWeight: 700 }}>Event {h.event_no} · {h.event} · Heat {h.heat} · Lane {h.lane}</div>
                <div className="small" style={{ opacity: 0.9 }}>{h.stage === 3 ? 'Go to the Call Room now.' : 'Please report to the Call Room.'}</div>
              </div>
            ))}

            <Alerts swimmerId={d.id} name={pretty(d.name)} />

            {d.results_url && <a className="btn primary" style={{ minHeight: 52, justifyContent: 'center' }} href={d.results_url}>Results and live times</a>}

            <div>
              <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>{heats.length ? 'Races, heats and lanes' : 'Entered events'}</div>
              {heats.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heats.map((h, i) => (
                    <div key={i} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, opacity: h.scratched ? 0.5 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>Event {h.event_no} · {h.event}</div>
                        <div className="small muted">Heat {h.heat} of {h.heats}{h.seed ? ` · Entry time ${h.seed}` : ''}{h.scratched ? ' · Withdrawn' : ''}</div>
                        {!h.scratched && h.stage >= 1 && <div className="small" style={{ fontWeight: 800, color: h.stage === 3 ? '#b4461a' : '#1f23c9' }}>{STAGE[h.stage]}</div>}
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 54 }}>
                        <div className="small muted">Lane</div>
                        <div style={{ fontWeight: 900, fontSize: 24, color: 'var(--navy)' }}>{h.lane}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : entries.length ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {entries.map((e, i) => (
                      <div key={i} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontWeight: 800 }}>Event {e.code || e.no} · {e.name}</div>
                        {e.seed && <div className="small muted">Entry time {e.seed}</div>}
                      </div>
                    ))}
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>Heats and lanes appear here when the heat sheet is published.</p>
                </>
              ) : <div className="small muted">Events appear here when the heat sheet is published.</div>}
            </div>
          </>
        )}
      </div>
      {d?.meet?.sponsor_banner && (
        <footer style={{ borderTop: '1px solid var(--line)', padding: 20, display: 'flex', justifyContent: 'center' }}>
          <img src={d.meet.sponsor_banner} alt="Meet sponsors" style={{ maxWidth: 'min(100%, 720px)', maxHeight: 80, objectFit: 'contain' }} />
        </footer>
      )}
    </div>
  )
}

// ---- Voice: read the call out loud like the spectator TV (English, then Arabic) ----
let voiceOn = false
const spoken = new Set()
function pickVoice(lang) {
  const vs = window.speechSynthesis?.getVoices() || []
  return vs.find((v) => v.lang?.toLowerCase().startsWith(lang)) || null
}
function sayText(text, lang) {
  return new Promise((done) => {
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'ar' ? 'ar-SA' : 'en-GB'
      const v = pickVoice(lang); if (v) u.voice = v
      u.rate = 0.95; u.onend = done; u.onerror = done
      window.speechSynthesis.speak(u)
      setTimeout(done, 15000)
    } catch { done() }
  })
}
export async function speakCall(c) {
  if (!voiceOn || !window.speechSynthesis || !c?.stage) return
  const key = `${c.event_no}-${c.heat}-${c.stage}`
  if (spoken.has(key)) return
  spoken.add(key)
  const t = speechForHeat({ event_no: c.event_no, event_name: c.event || '', heat_no: c.heat }, c.stage)
  if (!t) return
  await sayText(t.en, 'en')
  if (pickVoice('ar')) await sayText(t.ar, 'ar')
}

// ---- Call Room phone alerts ----
function b64ToBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

function Alerts({ swimmerId, name }) {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [state, setState] = useState('checking') // checking | off | on | blocked | unsupported | ios-home
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const key = `vc-alerts-${swimmerId}`
  const [flash, setFlash] = useState(null) // call received while this page is open
  const [voice, setVoice] = useState(false)
  function toggleVoice() {
    const v = !voice
    voiceOn = v; setVoice(v)
    if (v && window.speechSynthesis) { window.speechSynthesis.cancel(); sayText('Voice calls are on.', 'en') } // a tap unlocks speech on phones
    else window.speechSynthesis?.cancel()
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const on = (ev) => { if (ev.data?.type === 'vc-call') { setFlash(ev.data); speakCall(ev.data); try { navigator.vibrate?.([400, 150, 400]) } catch { /* not on iPhone */ } } }
    navigator.serviceWorker.addEventListener('message', on)
    try { navigator.serviceWorker.startMessages() } catch { /* older browsers */ }
    return () => navigator.serviceWorker.removeEventListener('message', on)
  }, [])

  useEffect(() => {
    if (!supported) { setState(isIOS() && !standalone() ? 'ios-home' : 'unsupported'); return }
    if (Notification.permission === 'denied') { setState('blocked'); return }
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/')
        try { await reg?.update() } catch { /* offline */ } // pick up the newest alert handler
        const sub = reg && await reg.pushManager.getSubscription()
        let on = false
        try { on = !!sub && localStorage.getItem(key) === sub.endpoint } catch { on = !!sub }
        setState(on ? 'on' : 'off')
      } catch { setState('off') }
    })()
  }, [supported, key])

  async function turnOn() {
    setBusy(true); setMsg('')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); setBusy(false); return }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const { publicKey } = await (await fetch(PUSH_URL)).json()
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) })
      const j = sub.toJSON()
      const r = await fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'subscribe', swimmer_id: swimmerId, subscription: j }) })
      if (!r.ok) throw new Error('Could not save the alerts. Please try again.')
      try { localStorage.setItem(key, j.endpoint) } catch { /* ignore */ }
      await fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', subscription: j }) })
      setState('on'); setMsg('Done. A test alert was sent to this phone.')
    } catch (x) { setMsg(x.message || 'Could not turn on alerts on this phone.') }
    setBusy(false)
  }
  async function turnOff() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = reg && await reg.pushManager.getSubscription()
      if (sub) await fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unsubscribe', swimmer_id: swimmerId, endpoint: sub.endpoint }) })
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      setState('off'); setMsg('Alerts are off for this swimmer on this phone.')
    } catch { setMsg('Could not turn off alerts. Please try again.') }
    setBusy(false)
  }

  return (
    <div style={{ border: '1.5px solid #c9cdf5', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: '#f5f6ff' }}>
      <div style={{ fontWeight: 800, color: 'var(--navy)' }}>Call Room alerts on this phone</div>
      {state === 'on' ? (
        <>
          <div className="small">✓ On. This phone will ring and vibrate at <strong>First Call</strong>, <strong>Second Call</strong> and <strong>In Call</strong> for {name}’s heats — no need to keep this page open.</div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={turnOff}>Turn off alerts</button>
        </>
      ) : state === 'ios-home' ? (
        <div className="small">On iPhone, alerts work from the Home Screen: tap <strong>Share</strong> <span aria-hidden="true">⎋</span> → <strong>Add to Home Screen</strong>, open Vortex from the Home Screen, then tap <strong>Turn on alerts</strong> here.</div>
      ) : state === 'unsupported' ? (
        <div className="small">This browser cannot receive alerts. Open this page in Chrome (Android) or Safari (iPhone, from the Home Screen).</div>
      ) : state === 'blocked' ? (
        <div className="small">Notifications are blocked for this site. Allow notifications for vortex-competition.vercel.app in your phone settings, then come back.</div>
      ) : (
        <>
          <div className="small">Get a phone alert when {name}’s heat is called to the Call Room (First Call, Second Call, In Call).</div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || state === 'checking'} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on alerts'}</button>
        </>
      )}
      {msg && <div className="small muted">{msg}</div>}
      {'speechSynthesis' in window && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #dfe2fb', paddingTop: 8 }}>
          <button type="button" className={`btn sm ${voice ? 'dark' : ''}`} onClick={toggleVoice}>{voice ? '🔊 Voice calls on' : '🔈 Turn on voice calls'}</button>
          <span className="small muted">{voice ? 'Keep this screen open: each call is read out loud in English and Arabic, like the venue screen.' : 'Read each call out loud on this screen, like the venue screen (keep the page open).'}</span>
        </div>
      )}
      {flash && (
        <div role="alert" onClick={() => setFlash(null)} style={{ background: flash.stage === 3 ? '#b4461a' : '#1f23c9', color: '#fff', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
          <div style={{ fontWeight: 900 }}>{flash.title}</div>
          <div className="small">{flash.body}</div>
        </div>
      )}
    </div>
  )
}
