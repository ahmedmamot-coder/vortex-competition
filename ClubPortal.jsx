import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'
import { logoToDataUrl, nameTokens, processPhoto, uploadPhoto } from './photos.jsx'

// Private page for one club (opened with its secret link). Before the heat sheet
// exists the club registers its swimmers (name + photo); once the heat sheet is
// imported, each swimmer also shows their events, and registered names are matched
// to the heat sheet names automatically.

const sameName = (a, b) => {
  const x = nameTokens(a), y = nameTokens(b)
  if (x.length < 2 || y.length < 2) return false
  const [small, big] = x.length <= y.length ? [x, y] : [y, x]
  const set = new Set(big)
  return small.every((t) => set.has(t))
}

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

  // One list: heat-sheet swimmers (with events) merged with swimmers the club registered.
  const people = useMemo(() => {
    if (!data) return []
    const reg = [...(data.registered || [])]
    const used = new Set()
    const out = (data.swimmers || []).map((s) => {
      const r = reg.find((x) => !used.has(x.id) && (x.entry_name === s.name || x.name === s.name)) || reg.find((x) => !used.has(x.id) && sameName(x.name, s.name))
      if (r) used.add(r.id)
      return { key: `h-${s.name}`, entryName: s.name, name: s.name, regName: r?.name, id: r?.id || null, events: s.events, has_photo: !!r?.has_photo, marketing: !!r?.marketing, onHeatSheet: true }
    })
    reg.filter((r) => !used.has(r.id)).forEach((r) => out.push({ key: `r-${r.id}`, name: r.name, id: r.id, events: r.entries || [], imported: !!r.entries, age: r.age, has_photo: r.has_photo, marketing: r.marketing, birth_year: r.birth_year, onHeatSheet: false }))
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const done = people.filter((s) => s.has_photo).length
  const shown = people.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))
  const heatSheet = !!data?.heat_sheet
  const notFound = heatSheet ? people.filter((p) => !p.onHeatSheet).length : 0

  return (
    <div className="vx-page">
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingTop: 16, paddingBottom: 16, flexWrap: 'wrap' }}>
          <img src={logoH} alt="Vortex International Championships 2026" style={{ height: 60 }} />
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
              <ClubLogo k={key} logo={data.club.logo} name={data.club.name} onSaved={(logo) => setData((d) => ({ ...d, club: { ...d.club, logo } }))} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="eyebrow" style={{ color: '#d5dbfa' }}>Club registration · names and photos</div>
                <h1 style={{ fontSize: 30, margin: '4px 0 0', color: '#fff' }}>{data.club.name}</h1>
                {data.club.name !== data.club.code && <div className="small" style={{ color: '#d5dbfa' }}>{data.club.code}</div>}
                <div className="small" style={{ color: '#d5dbfa', marginTop: 4 }}>To come back later: bookmark this page, or open the club registration link and choose “Already registered”.</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>{done} / {people.length}</div>
                <div className="small" style={{ color: '#d5dbfa' }}>swimmers with a photo</div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="notice" style={{ background: '#fff6e5', color: '#7a4b00', fontSize: 14 }}>
                <strong>Important — name spelling:</strong> enter each swimmer’s name <strong>exactly as in your HY-TEK entries or the Excel entry sheet you sent us</strong> (same spelling, same order, e.g. “Al-Marri, Fahad A”). That is how photos are matched to the heat sheet and the accreditation badges.
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {heatSheet
                  ? 'The heat sheet is published: swimmers from it are listed with their events. Add a clear head-and-shoulders photo for each one.'
                  : 'The heat sheet is not ready yet, so you can start now: add each swimmer’s name and photo below. When the heat sheet is published, their events will appear here automatically.'}
                {' '}Photos are used on accreditation badges and on the officials’ heat sheets, and are visible only to the meet organizers.
              </p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} style={{ width: 20, height: 20, margin: '1px 0 0', accentColor: '#1f23c9', flex: 'none' }} />
                <span>I am the club’s coach or team manager and the swimmers’ parents or guardians have agreed that these photos are used for accreditation and by meet officials.</span>
              </label>
            </div>

            <AddSwimmer k={key} enabled={authorised} onAdded={load} />

            {notFound > 0 && <div className="notice" style={{ background: '#fff6e5', color: '#7a4b00' }}>{notFound} registered swimmer{notFound === 1 ? ' is' : 's are'} not found on the heat sheet. Check the spelling against your entries and use “Edit name”.</div>}

            {people.length > 0 && <input className="input" placeholder="Search swimmer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search swimmer" style={{ maxWidth: 320 }} />}
            {!people.length ? (
              <div className="card empty">No swimmers yet. Add your first swimmer above.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {shown.map((s) => <SwimmerCard key={s.key} s={s} k={key} enabled={authorised} heatSheet={heatSheet} onChanged={load} />)}
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

function AddSwimmer({ k, enabled, onAdded }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState('')
  const [photo, setPhoto] = useState(null)
  const [marketing, setMarketing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const fileRef = useRef(null)

  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try { setPhoto(await processPhoto(f)); setErr('') } catch (x) { setErr(x.message) }
  }
  async function add(e) {
    e.preventDefault()
    setOk('')
    if (!enabled) return setErr('Tick the confirmation box above first.')
    if (name.trim().split(/\s+/).length < 2) return setErr('Enter the swimmer’s full name exactly as in your entries.')
    if (year && !(+year >= 1940 && +year <= new Date().getFullYear() - 3)) return setErr('Check the year of birth.')
    if (!photo) return setErr('Add the swimmer’s photo.')
    setBusy(true); setErr('')
    try {
      const path = await uploadPhoto('swimmers', photo.blob)
      const { error } = await supabase.rpc('vc_club_save_swimmer', { p_key: k, p_id: null, p_name: name, p_path: path, p_marketing: marketing, p_birth_year: year ? +year : null })
      if (error) throw new Error('The swimmer could not be saved. Please try again.')
      setOk(`${name.trim()} added.`); setName(''); setYear(''); setPhoto(null); setMarketing(false); onAdded()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <form onSubmit={add} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={!enabled}
        style={{ width: 84, height: 112, borderRadius: 12, border: '2px dashed #c9cdf5', background: '#f5f6ff', padding: 0, overflow: 'hidden', flex: 'none', cursor: enabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo ? <img src={photo.preview} alt="Selected photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f23c9', textAlign: 'center', padding: 6 }}>Add photo</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)' }}>Add a swimmer</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 2, minWidth: 220 }} placeholder="Name exactly as in HY-TEK / entry sheet" value={name} onChange={(e) => setName(e.target.value)} aria-label="Swimmer name" disabled={!enabled} />
          <input className="input num" style={{ width: 120 }} inputMode="numeric" maxLength={4} placeholder="Birth year" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Year of birth" disabled={!enabled} />
        </div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} disabled={!enabled} style={{ accentColor: '#1f23c9' }} /> Parents agree to marketing use
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn sm primary" disabled={busy || !enabled}>{busy ? 'Saving…' : 'Add swimmer'}</button>
          {!enabled && <span className="small muted">Tick the confirmation box above to start.</span>}
          {ok && <span className="chip ok">{ok}</span>}
        </div>
        {err && <span className="err-text">{err}</span>}
      </div>
    </form>
  )
}

function SwimmerCard({ s, k, enabled, heatSheet, onChanged }) {
  const [preview, setPreview] = useState(null)
  const [marketing, setMarketing] = useState(!!s.marketing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(s.name)
  const fileRef = useRef(null)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const { blob, preview: pv } = await processPhoto(file)
      const path = await uploadPhoto('swimmers', blob)
      const { error } = s.id
        ? await supabase.rpc('vc_club_save_swimmer', { p_key: k, p_id: s.id, p_name: s.regName || s.name, p_path: path, p_marketing: marketing, p_birth_year: null })
        : await supabase.rpc('vc_club_set_photo', { p_key: k, p_name: s.entryName, p_path: path, p_marketing: marketing })
      if (error) throw new Error('The photo could not be saved. Please try again.')
      setPreview(pv); onChanged()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  async function toggleMarketing(v) {
    setMarketing(v)
    if (!s.id) return
    const { error } = await supabase.rpc('vc_club_save_swimmer', { p_key: k, p_id: s.id, p_name: s.regName || s.name, p_path: null, p_marketing: v, p_birth_year: null })
    if (error) { setMarketing(!v); setErr('Could not save. Please try again.') }
  }

  async function rename(e) {
    e.preventDefault()
    if (newName.trim().split(/\s+/).length < 2) return setErr('Enter the full name.')
    setBusy(true)
    const { error } = await supabase.rpc('vc_club_save_swimmer', { p_key: k, p_id: s.id, p_name: newName, p_path: null, p_marketing: null, p_birth_year: null })
    setBusy(false)
    if (error) return setErr('Could not save the name. Please try again.')
    setEditing(false); onChanged()
  }

  const missing = heatSheet && !s.onHeatSheet
  return (
    <div style={{ border: `1.5px solid ${missing ? '#f0c36d' : s.has_photo ? '#bfe3d3' : 'var(--line)'}`, borderRadius: 14, padding: 12, display: 'flex', gap: 12, background: '#fff' }}>
      <button type="button" disabled={!enabled || busy} onClick={() => fileRef.current?.click()} title={enabled ? 'Add photo' : 'Tick the confirmation box first'}
        style={{ width: 72, height: 96, borderRadius: 10, border: `2px dashed ${s.has_photo ? '#0e7c66' : '#c9cdf5'}`, background: s.has_photo ? '#e5f5ee' : '#f5f6ff', padding: 0, overflow: 'hidden', flex: 'none', cursor: enabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {preview ? <img src={preview} alt={`Photo of ${s.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : s.has_photo ? <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0e7c66" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f23c9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {editing ? (
          <form onSubmit={rename} style={{ display: 'flex', gap: 6 }}>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ minHeight: 34, fontSize: 13 }} aria-label="Swimmer name" />
            <button className="btn sm primary" disabled={busy}>Save</button>
          </form>
        ) : <div style={{ fontWeight: 800, color: 'var(--navy)' }}>{s.name}</div>}
        {s.regName && s.regName !== s.name && <div className="small muted">Registered as: {s.regName}</div>}
        {s.events.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {s.events.map((e, i) => (
              <div key={i} className="small" style={{ color: 'var(--ink-2)' }}>#{e.no} {e.name} <span className="muted">· {e.heat ? `H${e.heat} L${e.lane}` : 'entry'}{e.seed ? ` · ${e.seed}` : ''}</span></div>
            ))}
          </div>
        ) : <div className="small muted">{missing ? 'Not found on the heat sheet — check the spelling.' : 'Events appear when the heat sheet is published.'}{s.birth_year ? ` · Born ${s.birth_year}` : ''}</div>}
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={marketing} onChange={(e) => toggleMarketing(e.target.checked)} style={{ accentColor: '#1f23c9' }} disabled={busy || !enabled} />
          Parents agree to marketing use
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
          <button type="button" className={`btn sm ${s.has_photo ? '' : 'primary'}`} disabled={!enabled || busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Saving…' : s.has_photo ? 'Replace photo' : 'Add photo'}
          </button>
          {s.id && !s.onHeatSheet && !s.imported && !editing && <button type="button" className="btn sm" disabled={!enabled} onClick={() => { setNewName(s.name); setEditing(true) }}>Edit name</button>}
          {s.has_photo && !busy && <span className="chip ok">Photo added</span>}
        </div>
        {err && <span className="err-text">{err}</span>}
      </div>
    </div>
  )
}

// The club or academy logo, uploaded from this page (shown to organizers and on the heat sheet).
function ClubLogo({ k, logo, name, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef(null)
  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try {
      const url = await logoToDataUrl(f)
      const { error } = await supabase.rpc('vc_club_set_logo', { p_key: k, p_logo: url })
      if (error) throw new Error('The logo could not be saved. Please try again.')
      onSaved(url)
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} title={logo ? 'Replace club logo' : 'Upload club logo'}
        style={{ width: 96, height: 96, borderRadius: 14, background: '#fff', border: logo ? '0' : '2px dashed #8e93c9', padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {logo ? <img src={logo} alt={`${name} logo`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f23c9', lineHeight: 1.3 }}>{busy ? 'Uploading…' : 'Add club logo'}</span>}
      </button>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} style={{ display: 'none' }} />
      {logo && <button type="button" className="btn sm ghost-light" style={{ minHeight: 26, fontSize: 11.5 }} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : 'Replace logo'}</button>}
      {err && <span className="small" style={{ color: '#ffd1cc', maxWidth: 160, textAlign: 'center' }}>{err}</span>}
    </div>
  )
}
