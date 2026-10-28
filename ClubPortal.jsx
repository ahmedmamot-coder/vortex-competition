import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoH from './logo-horizontal.svg'
import { supabase } from './supabase.js'
import { processPhoto, uploadPhoto } from './photos.jsx'

// Private page for one club (opened with its secret link): the club's swimmers and
// events from the heat sheet, with a photo upload next to each name.
export default function ClubPortal() {
  const key = new URLSearchParams(window.location.search).get('key') || ''
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [authorised, setAuthorised] = useState(false)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (key.length < 24) { setStatus('badkey'); return }
    const { data: d, error } = await supabase.rpc('vc_club_portal', { p_key: key })
    if (error) { setStatus('error'); return }
    if (!d) { setStatus('badkey'); return }
    setData(d); setStatus('ok')
  }, [key])
  useEffect(() => { load() }, [load])

  const swimmers = data?.swimmers || []
  const done = swimmers.filter((s) => s.has_photo).length
  const shown = useMemo(() => swimmers.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())), [swimmers, q])

  function markDone(name, marketing) {
    setData((d) => ({ ...d, swimmers: d.swimmers.map((s) => (s.name === name ? { ...s, has_photo: true, marketing } : s)) }))
  }

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingTop: 16, paddingBottom: 16, flexWrap: 'wrap' }}>
          <img src={logoH} alt="Vortex Swimming Club" style={{ height: 40 }} />
          {data && <div className="small muted" style={{ textAlign: 'right' }}>{data.meet?.name}{data.meet?.venue ? ` · ${data.meet.venue}` : ''}{data.meet?.meet_date ? ` · ${data.meet.meet_date}` : ''}</div>}
        </div>
      </header>

      <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 24, paddingBottom: 40 }}>
        {status === 'loading' && <div className="empty">Loading…</div>}
        {status === 'badkey' && <div className="card empty"><h1 style={{ fontSize: 22 }}>This club link is not valid</h1><p>Ask the meet organizers for your club’s current link.</p></div>}
        {status === 'error' && <div className="card empty"><h1 style={{ fontSize: 22 }}>Could not load your club</h1><p>Check your connection and refresh the page.</p></div>}

        {status === 'ok' && (
          <>
            <div className="card navy" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow" style={{ color: '#d5dbfa' }}>Club accreditation photos</div>
                <h1 style={{ fontSize: 30, margin: '4px 0 0', color: '#fff' }}>{data.club.name}</h1>
                {data.club.name !== data.club.code && <div className="small" style={{ color: '#d5dbfa' }}>{data.club.code}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>{done} / {swimmers.length}</div>
                <div className="small" style={{ color: '#d5dbfa' }}>swimmers with a photo</div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="small muted" style={{ margin: 0 }}>
                These are your club’s swimmers and events from the meet heat sheet. Add a clear head-and-shoulders photo for each swimmer. Photos are used on accreditation badges and on the officials’ heat sheets, and are visible only to the meet organizers.
              </p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} style={{ width: 20, height: 20, margin: '1px 0 0', accentColor: '#1f23c9', flex: 'none' }} />
                <span>I am the club’s coach or team manager and the swimmers’ parents or guardians have agreed that these photos are used for accreditation and by meet officials.</span>
              </label>
              <input className="input" placeholder="Search swimmer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search swimmer" style={{ maxWidth: 320 }} />
            </div>

            {!swimmers.length ? (
              <div className="card empty">No swimmers from your club are on the heat sheet yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {shown.map((s) => <SwimmerCard key={s.name} s={s} k={key} enabled={authorised} onDone={markDone} />)}
              </div>
            )}
            <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Questions? <a href="mailto:aquaticmanager@vortexaquatics.com">aquaticmanager@vortexaquatics.com</a></p>
          </>
        )}
        {data?.meet?.sponsor_banner && <img src={data.meet.sponsor_banner} alt="Meet sponsors" style={{ alignSelf: 'center', maxWidth: 'min(100%, 720px)', maxHeight: 80, objectFit: 'contain' }} />}
      </main>
    </div>
  )
}

function SwimmerCard({ s, k, enabled, onDone }) {
  const [preview, setPreview] = useState(null)
  const [marketing, setMarketing] = useState(!!s.marketing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const { blob, preview: pv } = await processPhoto(file)
      const path = await uploadPhoto('swimmers', blob)
      const { error } = await supabase.rpc('vc_club_set_photo', { p_key: k, p_name: s.name, p_path: path, p_marketing: marketing })
      if (error) throw new Error('The photo could not be saved. Please try again.')
      setPreview(pv); onDone(s.name, marketing)
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  async function toggleMarketing(v) {
    setMarketing(v)
    if (!s.has_photo) return
    const { error } = await supabase.rpc('vc_club_set_marketing', { p_key: k, p_name: s.name, p_marketing: v })
    if (error) { setMarketing(!v); setErr('Could not save. Please try again.') } else onDone(s.name, v)
  }

  return (
    <div style={{ border: `1.5px solid ${s.has_photo ? '#bfe3d3' : 'var(--line)'}`, borderRadius: 14, padding: 12, display: 'flex', gap: 12, background: '#fff' }}>
      <button type="button" disabled={!enabled || busy} onClick={() => fileRef.current?.click()} title={enabled ? 'Add photo' : 'Tick the confirmation box first'}
        style={{ width: 72, height: 96, borderRadius: 10, border: `2px dashed ${s.has_photo ? '#0e7c66' : '#c9cdf5'}`, background: s.has_photo ? '#e5f5ee' : '#f5f6ff', padding: 0, overflow: 'hidden', flex: 'none', cursor: enabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {preview ? <img src={preview} alt={`Photo of ${s.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : s.has_photo ? <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0e7c66" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f23c9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)' }}>{s.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {s.events.map((e, i) => (
            <div key={i} className="small" style={{ color: 'var(--ink-2)' }}>#{e.no} {e.name} <span className="muted">· H{e.heat} L{e.lane}{e.seed ? ` · ${e.seed}` : ''}</span></div>
          ))}
        </div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={marketing} onChange={(e) => toggleMarketing(e.target.checked)} style={{ accentColor: '#1f23c9' }} disabled={busy || !enabled} />
          Parents agree to marketing use
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
          <button type="button" className={`btn sm ${s.has_photo ? '' : 'primary'}`} disabled={!enabled || busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : s.has_photo ? 'Replace photo' : 'Add photo'}
          </button>
          {s.has_photo && !busy && <span className="chip ok">Photo added</span>}
        </div>
        {err && <span className="err-text">{err}</span>}
      </div>
    </div>
  )
}
