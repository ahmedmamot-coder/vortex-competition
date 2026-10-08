import { useEffect, useMemo, useRef, useState } from 'react'
import logoH from './logo-horizontal.svg'
import { supabase } from './supabase.js'
import { useMeet } from './useMeet.js'
import { heatCode, isArabic, speechForHeat } from './lib.js'

// Spectator-area TV: shows which heats are being called and reads every call
// out loud (voice-over) so swimmers in the stands go to the call room.
// Calls arrive live from the console (Call Room) through vc_announcements.

const STAGE_STYLE = {
  1: { label: '1st call', bg: '#1f23c9' },
  2: { label: '2nd call', bg: '#1f23c9' },
  3: { label: 'Final call', bg: '#b4461a' }
}

function pref(key, def) {
  try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v) } catch { return def }
}
function savePref(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}

export default function TV() {
  const { meet, order, runIdx, entries, laneStart, loading } = useMeet()
  const [voiceOn, setVoiceOn] = useState(false)
  const [lang, setLang] = useState(() => pref('vc-tv-lang', 'en-ar'))
  const [repeat, setRepeat] = useState(() => pref('vc-tv-repeat', 1))
  const [flash, setFlash] = useState(null)
  const [clock, setClock] = useState(() => new Date())
  const [showControls, setShowControls] = useState(true)
  const seen = useRef(new Set())
  const queue = useRef([])
  const speaking = useRef(false)
  const audioCtx = useRef(null)
  const orderRef = useRef(order)
  orderRef.current = order
  const settings = useRef({ voiceOn, lang, repeat })
  settings.current = { voiceOn, lang, repeat }

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t) }, [])
  useEffect(() => { savePref('vc-tv-lang', lang) }, [lang])
  useEffect(() => { savePref('vc-tv-repeat', repeat) }, [repeat])
  useEffect(() => { if (!voiceOn) return; const t = setTimeout(() => setShowControls(false), 8000); return () => clearTimeout(t) }, [voiceOn])

  // ---------- audio ----------
  function chime() {
    const ctx = audioCtx.current
    if (!ctx) return Promise.resolve()
    const now = ctx.currentTime
    ;[[784, 0], [988, 0.28], [1175, 0.56]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, now + t)
      g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.45)
      o.connect(g).connect(ctx.destination); o.start(now + t); o.stop(now + t + 0.5)
    })
    return new Promise((r) => setTimeout(r, 1200))
  }

  function pickVoice(code) {
    const voices = window.speechSynthesis?.getVoices() || []
    const pool = voices.filter((v) => v.lang?.toLowerCase().startsWith(code))
    const wanted = code === 'en' ? [/en-GB/i, /en-US/i] : [/ar/i]
    for (const re of wanted) {
      const good = pool.filter((v) => re.test(v.lang))
      const named = good.find((v) => /Google|Daniel|Samantha|Serena|Maged|Tarik|Majed|Laila|Natural|Premium|Enhanced/i.test(v.name))
      if (named || good[0]) return named || good[0]
    }
    return pool[0] || null
  }

  function say(text, code) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis
      if (!synth || !text) return resolve()
      const voice = pickVoice(code)
      if (code === 'ar' && !voice) return resolve() // no Arabic voice installed on this device
      const u = new SpeechSynthesisUtterance(text)
      if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = code === 'ar' ? 'ar-SA' : 'en-GB'
      u.rate = code === 'ar' ? 0.9 : 0.92
      u.pitch = 1
      u.volume = 1
      const done = () => resolve()
      u.onend = done; u.onerror = done
      setTimeout(done, 20000)
      synth.speak(u)
    })
  }

  async function runQueue() {
    if (speaking.current) return
    speaking.current = true
    while (queue.current.length) {
      const item = queue.current.shift()
      setFlash(item)
      const { voiceOn: on, lang: l, repeat: rep } = settings.current
      if (on) {
        for (let i = 0; i < rep; i++) {
          await chime()
          if (item.custom) {
            await say(item.en, isArabic(item.en) ? 'ar' : 'en')
          } else {
            await say(item.en, 'en')
            if (l === 'en-ar') await say(item.ar, 'ar')
          }
          if (i < rep - 1) await new Promise((r) => setTimeout(r, 1500))
        }
      } else {
        await new Promise((r) => setTimeout(r, 6000))
      }
      await new Promise((r) => setTimeout(r, 2500))
    }
    speaking.current = false
    setTimeout(() => { if (!speaking.current) setFlash(null) }, 6000)
  }

  function enqueue(row) {
    if (seen.current.has(row.id)) return
    seen.current.add(row.id)
    let item
    if (row.message) {
      item = { id: row.id, custom: true, en: row.message, title: 'Announcement', heat: null }
    } else {
      const h = orderRef.current.find((x) => x.id === row.heat_id)
      const s = speechForHeat(h, row.stage)
      if (!s) return
      item = { id: row.id, custom: false, en: s.en, ar: s.ar, title: s.label, stage: row.stage, heat: h }
    }
    queue.current.push(item)
    runQueue()
  }

  // ---------- live announcements ----------
  useEffect(() => {
    if (!meet?.id) return
    const ch = supabase.channel('vc-tv-announce')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vc_announcements', filter: `meet_id=eq.${meet.id}` }, (p) => {
        const row = p.new
        if (Date.now() - new Date(row.created_at).getTime() < 120000) enqueue(row)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [meet?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function enableVoice() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC && !audioCtx.current) audioCtx.current = new AC()
      audioCtx.current?.resume()
      window.speechSynthesis?.getVoices()
      const u = new SpeechSynthesisUtterance(' ') // unlocks speech on Safari / iPad
      u.volume = 0
      window.speechSynthesis?.speak(u)
    } catch { /* ignore */ }
    setVoiceOn(true)
  }
  function testVoice() {
    const h = order.find((x, i) => i > runIdx) || order[0]
    const s = h ? speechForHeat(h, 1) : null
    queue.current.push(s
      ? { id: `test-${Date.now()}`, custom: false, en: s.en, ar: s.ar, title: 'Test · ' + s.label, stage: 1, heat: h }
      : { id: `test-${Date.now()}`, custom: true, en: 'This is a test of the Vortex call room announcements.', title: 'Test' })
    runQueue()
  }

  // ---------- what to show ----------
  const calling = useMemo(() => order
    .filter((h, i) => i > runIdx && h.call_stage >= 1 && h.call_stage <= 3)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 2), [order, runIdx])
  const racing = runIdx >= 0 ? order[runIdx] : null
  const upcoming = useMemo(() => order.filter((h, i) => i > runIdx && h.call_stage === 0).slice(0, 4), [order, runIdx])

  function lanesFor(h) {
    const n = meet?.lanes || 8
    const by = new Map(entries.filter((e) => e.heat_id === h.id).map((e) => [e.lane, e]))
    return Array.from({ length: n }, (_, i) => by.get(i + laneStart)).filter(Boolean)
  }

  return (
    <div className="tv" onMouseMove={() => setShowControls(true)}>
      <header className="tv-head">
        <img src={logoH} alt="Vortex Swimming Club" />
        <div className="tv-title">
          <div className="tv-meet">{meet?.name || 'Vortex Competition'}</div>
          <div className="tv-sub">Call room · نداء السباحين</div>
        </div>
        <div className="tv-clock">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </header>

      <main className="tv-main">
        <section className="tv-calls">
          {loading ? <div className="tv-empty">Loading…</div> : calling.length === 0 ? (
            <div className="tv-empty">
              <div style={{ fontSize: '2.4vw', fontWeight: 800, color: 'var(--navy)' }}>No heats being called right now</div>
              <div>Listen for the next call · انتظروا النداء التالي</div>
            </div>
          ) : calling.map((h) => {
            const st = STAGE_STYLE[h.call_stage]
            const lanes = lanesFor(h)
            return (
              <article key={h.id} className="tv-call" style={{ borderColor: st.bg }}>
                <div className="tv-call-head">
                  <div>
                    <div className="tv-call-title">Event {h.event_no} · Heat {h.heat_no}</div>
                    <div className="tv-call-sub">{h.event_name}</div>
                  </div>
                  <div className={`tv-stage ${h.call_stage === 3 ? 'pulse' : ''}`} style={{ background: st.bg }}>{st.label.toUpperCase()}</div>
                </div>
                <div className="tv-go">Go to the call room now · توجهوا إلى غرفة النداء</div>
                {lanes.length > 0 && (
                  <div className="tv-lanes" style={{ '--rows': Math.ceil(lanes.length / 2) }}>
                    {lanes.map((l) => (
                      <div key={l.id} className="tv-lane" style={{ opacity: l.scratched ? 0.4 : 1 }}>
                        <span className="lane">{l.lane}</span>
                        <span className="tv-name">{l.swimmer_name}</span>
                        <span className="tv-club">{l.scratched ? 'Scratched' : (l.club || '').split(' · ')[0]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </section>

        <aside className="tv-side">
          <div className="tv-box navy">
            <div className="eyebrow" style={{ color: '#a9b6f5' }}>Now racing</div>
            <div className="tv-box-big">{racing ? heatCode(racing) : '—'}</div>
            <div className="tv-box-sub" style={{ color: '#d5dbfa' }}>{racing ? racing.event_name : 'Not started'}</div>
          </div>
          <div className="tv-box">
            <div className="eyebrow">Coming up · القادم</div>
            {upcoming.length === 0 ? <div className="tv-box-sub">—</div> : upcoming.map((h) => (
              <div key={h.id} className="tv-up">
                <span className="tv-up-code">{heatCode(h)}</span>
                <span className="tv-up-name">{h.event_name}</span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {meet?.sponsor_banner && <footer className="tv-foot"><img src={meet.sponsor_banner} alt="Meet sponsors" /></footer>}

      {flash && (
        <div className="tv-flash" role="status" aria-live="assertive">
          <div className="tv-flash-card" style={{ borderColor: flash.stage === 3 ? '#b4461a' : '#1f23c9' }}>
            <div className="tv-flash-label" style={{ background: flash.stage === 3 ? '#b4461a' : '#1f23c9' }}>{flash.title.toUpperCase()}</div>
            {flash.heat
              ? <><div className="tv-flash-title">Event {flash.heat.event_no} · Heat {flash.heat.heat_no}</div><div className="tv-flash-sub">{flash.heat.event_name}</div></>
              : <div className="tv-flash-title" dir={isArabic(flash.en) ? 'rtl' : 'ltr'}>{flash.en}</div>}
            <div className="tv-flash-go">Swimmers, go to the call room · توجهوا إلى غرفة النداء</div>
          </div>
        </div>
      )}

      {!voiceOn ? (
        <div className="tv-enable">
          <button className="btn primary" style={{ minHeight: 64, fontSize: 22, padding: '0 32px' }} onClick={enableVoice}>Tap to turn on voice announcements</button>
          <div className="small muted">Browsers only allow sound after one tap. Keep this screen open on the spectator TV.</div>
        </div>
      ) : showControls && (
        <div className="tv-controls">
          <span className="chip ok">Voice on</span>
          <select className="input" aria-label="Announcement language" value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: 'auto', minHeight: 36 }}>
            <option value="en-ar">English + Arabic</option>
            <option value="en">English only</option>
          </select>
          <select className="input" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(+e.target.value)} style={{ width: 'auto', minHeight: 36 }}>
            <option value={1}>Say once</option>
            <option value={2}>Say twice</option>
          </select>
          <button className="btn sm" onClick={testVoice}>Test voice</button>
          <button className="btn sm" onClick={() => document.documentElement.requestFullscreen?.()}>Full screen</button>
        </div>
      )}
    </div>
  )
}
