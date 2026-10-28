import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { Avatar, processPhoto, uploadPhoto } from './photos.jsx'

const PALETTE = ['#121236', '#1F23C9', '#3A7BE0', '#0E7C66', '#7A3FC2', '#B4461A', '#A1185A', '#4A4F6E']
export const ATHLETE_COLOR = '#B4461A'

// People & photos database: staff and swimmers, badge printing and the marketing export.
export default function People({ data, people }) {
  const { apps, positions, meet, entries } = data
  const { swimmers, urls, swimmerFor } = people
  const [view, setView] = useState('staff')
  const [clubFilter, setClubFilter] = useState('')
  const [clubs, setClubs] = useState([])
  const loadClubs = useCallback(async () => {
    if (!meet) return
    const { data: c } = await supabase.from('vc_clubs').select('*').eq('meet_id', meet.id)
    setClubs(c || [])
  }, [meet])
  useEffect(() => { loadClubs() }, [loadClubs])
  const clubName = useMemo(() => Object.fromEntries(clubs.map((c) => [c.code, c.full_name || c.code])), [clubs])
  // Clubs on the heat sheet (relay rows carry "TEAM · names" and are skipped).
  const clubStats = useMemo(() => {
    const m = {}
    entries.forEach((e) => {
      if (!e.club || e.club.includes('·')) return
      const c = (m[e.club] = m[e.club] || { code: e.club, names: new Set(), withPhoto: new Set() })
      c.names.add(e.swimmer_name)
      if (people.photoForEntry(e)) c.withPhoto.add(e.swimmer_name)
    })
    return Object.values(m).sort((a, b) => b.names.size - a.names.size)
  }, [entries, people])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState('')

  const groupColor = useMemo(() => {
    const m = {}
    let i = 0
    positions.forEach((p) => { if (!(p.group_name in m)) m[p.group_name] = PALETTE[i++ % PALETTE.length] })
    return m
  }, [positions])
  const posGroup = useMemo(() => Object.fromEntries(positions.map((p) => [p.name, p.group_name])), [positions])

  // Heat-sheet entries per swimmer (auto-matched by name, or linked by hand).
  const entryNames = useMemo(() => [...new Set(entries.map((e) => e.swimmer_name).filter(Boolean))].sort(), [entries])
  const matches = useMemo(() => {
    const m = {}
    entries.forEach((e) => { const s = swimmerFor(e.swimmer_name); if (s) (m[s.id] = m[s.id] || []).push(e) })
    return m
  }, [entries, swimmerFor])

  const staffRows = useMemo(() => apps
    .filter((a) => (view === 'staff' ? a.status === 'approved' : a.status !== 'declined'))
    .map((a) => ({
      kind: 'staff', id: a.id, raw: a, name: a.full_name, photo_path: a.photo_path, photoUrl: urls[a.photo_path] || null,
      role: a.position, sub: posGroup[a.position] || 'Meet staff', color: groupColor[posGroup[a.position]] || '#1F23C9',
      marketing: a.marketing_consent, status: a.status
    })), [apps, view, urls, posGroup, groupColor])
  const swimmerRows = useMemo(() => swimmers.map((s) => ({
    kind: 'swimmer', id: s.id, raw: s, name: s.full_name, photo_path: s.photo_path, photoUrl: urls[s.photo_path] || null,
    role: 'Athlete', sub: [clubName[s.club] || s.club, s.birth_year].filter(Boolean).join(' · '), color: ATHLETE_COLOR, marketing: s.marketing_consent
  })), [swimmers, urls, clubName])

  const rows = (view === 'swimmers' ? swimmerRows : view === 'clubs' ? [] : staffRows)
    .filter((r) => view !== 'swimmers' || !clubFilter || r.raw.club === clubFilter)
    .filter((r) => !q.trim() || `${r.name} ${r.role} ${r.sub}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const chosen = rows.filter((r) => sel.has(r.id))
  const missing = rows.filter((r) => !r.photo_path).length

  function toggle(id) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function switchView(v) { setView(v); setSel(new Set()) }

  async function copy(path, which) {
    const url = `${window.location.origin}${path}`
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copy this link', url) }
    setCopied(which); setTimeout(() => setCopied(''), 2000)
  }

  async function printBadges(override, label) {
    const list = override || (chosen.length ? chosen : rows)
    if (!list.length) return
    setBusy('badges'); setNote('')
    try {
      const { badgesPdf } = await import('./pdfout.js')
      const doc = await badgesPdf({ people: list, meet, onProgress: (n, t) => setNote(`Preparing photos ${n} / ${t}…`) })
      doc.save(`vortex-badges-${label || view}-${new Date().toISOString().slice(0, 10)}.pdf`)
      setNote(`Badges PDF downloaded: ${list.length} badge${list.length === 1 ? '' : 's'}, 4 per A4 page (A6 size, cut along the dotted lines).`)
    } catch (x) { setNote(`Could not make the badges: ${x.message}`) }
    setBusy('')
  }

  async function exportBook() {
    setBusy('book'); setNote('')
    try {
      const staff = apps.filter((a) => a.status === 'approved' && a.marketing_consent && a.photo_path)
        .map((a) => ({ name: a.full_name, photoUrl: urls[a.photo_path], role: a.position, sub: posGroup[a.position] || '' }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const sw = swimmers.filter((s) => s.marketing_consent && s.photo_path)
        .map((s) => ({ name: s.full_name, photoUrl: urls[s.photo_path], role: s.club || '', sub: s.birth_year ? `Born ${s.birth_year}` : '' }))
        .sort((a, b) => a.name.localeCompare(b.name))
      if (!staff.length && !sw.length) { setNote('Nobody with a photo has agreed to marketing use yet, so there is nothing to export.'); setBusy(''); return }
      const { photoBookPdf } = await import('./pdfout.js')
      const doc = await photoBookPdf({ meet, sections: [{ title: 'Staff & officials', people: staff }, { title: 'Swimmers', people: sw }], onProgress: (n, t) => setNote(`Preparing photos ${n} / ${t}…`) })
      doc.save(`vortex-people-photos-${new Date().toISOString().slice(0, 10)}.pdf`)
      const left = apps.filter((a) => a.status === 'approved').length - staff.length + swimmers.length - sw.length
      setNote(`Marketing PDF downloaded: ${staff.length} staff and ${sw.length} swimmers. ${left > 0 ? `${left} people were left out (no marketing consent or no photo).` : ''}`)
    } catch (x) { setNote(`Could not make the PDF: ${x.message}`) }
    setBusy('')
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }} aria-label="People and photos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 24 }}>People &amp; photos</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{apps.filter((a) => a.status === 'approved').length} approved staff · {swimmers.length} registered swimmers · photos are private to organizers</p>
        </div>
        <div className="actions">
          <button className="btn sm" onClick={() => copy('/swimmer', 'swimmer')}>{copied === 'swimmer' ? 'Link copied' : 'Copy swimmer registration link'}</button>
          <a className="btn sm" href="/heatsheet" target="_blank" rel="noreferrer">Heat sheet with photos</a>
          <button className="btn sm dark" onClick={exportBook} disabled={!!busy}>{busy === 'book' ? 'Building PDF…' : 'Export marketing PDF'}</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="pills">
            <button className="pill" aria-pressed={view === 'staff'} onClick={() => switchView('staff')}>Approved staff</button>
            <button className="pill" aria-pressed={view === 'allstaff'} onClick={() => switchView('allstaff')}>All staff applicants</button>
            <button className="pill" aria-pressed={view === 'swimmers'} onClick={() => switchView('swimmers')}>Swimmers</button>
            <button className="pill" aria-pressed={view === 'clubs'} onClick={() => switchView('clubs')}>Clubs</button>
          </div>
          {view === 'swimmers' && (
            <select className="input" style={{ width: 'auto' }} value={clubFilter} onChange={(e) => { setClubFilter(e.target.value); setSel(new Set()) }} aria-label="Filter by club">
              <option value="">All clubs</option>
              {clubStats.map((c) => <option key={c.code} value={c.code}>{clubName[c.code] || c.code}</option>)}
            </select>
          )}
          {view !== 'clubs' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 220 }} placeholder="Search name, role, club" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
            <button className="btn sm primary" onClick={printBadges} disabled={!!busy || !rows.length}>
              {busy === 'badges' ? 'Building badges…' : `Print badges (${chosen.length || rows.length})`}
            </button>
          </div>}
        </div>
        {view === 'clubs' ? (
          <ClubsTable clubStats={clubStats} clubs={clubs} meet={meet} reload={loadClubs} busy={busy}
            onBadges={(c) => printBadges([...c.names].sort().map((n) => ({ name: n, photoUrl: people.photoForEntry({ swimmer_name: n }), role: 'Athlete', sub: clubName[c.code] || c.code, color: ATHLETE_COLOR, id: null })), `club-${c.code}`)} />
        ) : <>
        <div className="small muted">
          {chosen.length ? `${chosen.length} selected — only these will be printed. ` : 'Tick people to print only some badges. '}
          {missing ? `${missing} without a photo (their badge shows initials).` : ''}
          {chosen.length > 0 && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setSel(new Set())}>Clear selection</button>}
        </div>
        {note && <div className="notice">{note}</div>}
        {people.error && <div className="notice error">{people.error}</div>}

        {!rows.length ? (
          <div className="empty">{view === 'swimmers' ? 'No swimmers registered yet. Share the swimmer registration link with parents.' : 'No staff in this list yet.'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {rows.map((r) => (
              <PersonCard key={r.id} r={r} selected={sel.has(r.id)} onToggle={() => toggle(r.id)} data={data} people={people}
                matched={r.kind === 'swimmer' ? matches[r.id] || [] : null} entryNames={entryNames} />
            ))}
          </div>
        )}
        </>}
      </div>
    </section>
  )
}

// One row per club on the heat sheet: display name, photo progress, private upload link.
function ClubsTable({ clubStats, clubs, meet, reload, busy, onBadges }) {
  const [note, setNote] = useState('')
  const byCode = Object.fromEntries(clubs.map((c) => [c.code, c]))

  async function ensure(code) {
    if (byCode[code]) return byCode[code]
    const { data, error } = await supabase.from('vc_clubs').insert({ meet_id: meet.id, code }).select().single()
    if (error) throw new Error(error.message)
    await reload()
    return data
  }
  async function copyLink(code) {
    try {
      const c = await ensure(code)
      const url = `${window.location.origin}/club?key=${c.access_key}`
      try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copy this link', url) }
      setNote(`Link for ${c.full_name || code} copied. Send it only to that club’s coach or team manager.`)
    } catch (x) { setNote(x.message) }
  }
  async function newLink(code) {
    const c = byCode[code]
    if (!c || !window.confirm('Make a new link for this club? The old link will stop working.')) return
    const key = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('')
    const { error } = await supabase.from('vc_clubs').update({ access_key: key }).eq('id', c.id)
    setNote(error ? error.message : 'New link made. Copy it and send it to the club.')
    reload()
  }
  async function rename(code, full_name) {
    try {
      const c = await ensure(code)
      if ((c.full_name || '') === full_name.trim()) return
      await supabase.from('vc_clubs').update({ full_name: full_name.trim() || null }).eq('id', c.id)
      reload()
    } catch (x) { setNote(x.message) }
  }

  if (!clubStats.length) return <div className="empty">Import the heat sheet first — clubs are taken from it.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>Each club gets a private link showing only its own swimmers and events, where the coach can upload a photo next to each name. Photos appear here, on badges and on the heat sheet straight away.</p>
      {note && <div className="notice">{note}</div>}
      <div className="table">
        <table>
          <thead><tr><th>Code</th><th>Club name (shown at the top of their page)</th><th>Swimmers</th><th>Photos</th><th /></tr></thead>
          <tbody>
            {clubStats.map((c) => {
              const row = byCode[c.code]
              const pct = Math.round((c.withPhoto.size / c.names.size) * 100)
              return (
                <tr key={c.code}>
                  <td style={{ fontWeight: 800 }}>{c.code}</td>
                  <td><input className="input" defaultValue={row?.full_name || ''} placeholder={c.code} onBlur={(e) => rename(c.code, e.target.value)} style={{ minHeight: 34, fontSize: 13, minWidth: 200 }} aria-label={`Full name for ${c.code}`} /></td>
                  <td className="num">{c.names.size}</td>
                  <td style={{ minWidth: 120 }}>
                    <div className="small" style={{ fontWeight: 700 }}>{c.withPhoto.size} / {c.names.size}</div>
                    <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn sm dark" onClick={() => copyLink(c.code)}>{row ? 'Copy club link' : 'Create club link'}</button>
                      {row && <a className="btn sm" href={`/club?key=${row.access_key}`} target="_blank" rel="noreferrer">Open</a>}
                      {row && <button className="btn sm" onClick={() => newLink(c.code)}>New link</button>}
                      <button className="btn sm" disabled={!!busy} onClick={() => onBadges(c)}>Badges</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonCard({ r, selected, onToggle, data, people, matched, entryNames }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState(r.raw.entry_name || '')
  const fileRef = useRef(null)
  const table = r.kind === 'swimmer' ? 'vc_swimmers' : 'vc_applications'

  async function replacePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const { blob } = await processPhoto(file)
      const path = await uploadPhoto(r.kind === 'swimmer' ? 'swimmers' : 'staff', blob)
      const { error } = await supabase.from(table).update({ photo_path: path }).eq('id', r.id)
      if (error) throw new Error(error.message)
      if (r.photo_path) await supabase.storage.from('vc-photos').remove([r.photo_path])
      r.kind === 'swimmer' ? people.reload() : data.reload()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  async function toggleMarketing() {
    const { error } = await supabase.from(table).update({ marketing_consent: !r.marketing }).eq('id', r.id)
    if (error) return setErr(error.message)
    r.kind === 'swimmer' ? people.reload() : data.reload()
  }
  async function saveLink(e) {
    e.preventDefault()
    const { error } = await supabase.from('vc_swimmers').update({ entry_name: link.trim() || null }).eq('id', r.id)
    if (error) return setErr(error.message)
    setLinking(false); people.reload()
  }
  async function removeSwimmer() {
    if (!window.confirm(`Delete ${r.name} and their photo from the database?`)) return
    const { error } = await supabase.from('vc_swimmers').delete().eq('id', r.id)
    if (error) return setErr(error.message)
    if (r.photo_path) await supabase.storage.from('vc-photos').remove([r.photo_path])
    people.reload()
  }

  return (
    <div style={{ border: `1.5px solid ${selected ? '#1f23c9' : 'var(--line)'}`, borderRadius: 14, padding: 12, display: 'flex', gap: 12, background: selected ? '#f5f6ff' : '#fff' }}>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title={r.photo_path ? 'Replace photo' : 'Upload photo'} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', position: 'relative', alignSelf: 'flex-start' }}>
        <Avatar src={r.photoUrl} name={r.name} size={72} radius={10} />
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(18,18,54,.7)', borderRadius: '0 0 10px 10px', padding: '2px 0', textAlign: 'center' }}>{busy ? '…' : r.photo_path ? 'Replace' : 'Upload'}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={replacePhoto} style={{ display: 'none' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 800, color: 'var(--navy)', lineHeight: 1.25 }}>{r.name}</div>
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${r.name} for badge printing`} style={{ width: 18, height: 18, accentColor: '#1f23c9', flex: 'none' }} />
        </div>
        <div className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color, flex: 'none' }} />
          <span style={{ fontWeight: 700 }}>{r.role}</span>
          {r.status && r.status !== 'approved' && <span className="chip warn">{r.status}</span>}
        </div>
        {r.sub && <div className="small muted">{r.sub}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <button className="chip" onClick={toggleMarketing} title="Click to change" style={{ border: 0, cursor: 'pointer', background: r.marketing ? '#e5f5ee' : '#f1f2f6', color: r.marketing ? '#0e7c66' : '#4a4f6e' }}>{r.marketing ? 'Marketing: yes' : 'Marketing: no'}</button>
          {matched && (matched.length
            ? <span className="chip ok">On heat sheet: {matched.length} swim{matched.length === 1 ? '' : 's'}</span>
            : <span className="chip warn">Not found on heat sheet</span>)}
        </div>
        {matched && (linking ? (
          <form onSubmit={saveLink} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="input" list={`names-${r.id}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Name as on heat sheet" style={{ minHeight: 34, fontSize: 13 }} />
            <datalist id={`names-${r.id}`}>{entryNames.map((n) => <option key={n} value={n} />)}</datalist>
            <button className="btn sm primary">Save</button>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button className="btn sm" onClick={() => setLinking(true)}>{r.raw.entry_name ? 'Change heat-sheet name' : 'Link heat-sheet name'}</button>
            <button className="btn sm" onClick={removeSwimmer}>Delete</button>
          </div>
        ))}
        {err && <span className="err-text">{err}</span>}
      </div>
    </div>
  )
}
