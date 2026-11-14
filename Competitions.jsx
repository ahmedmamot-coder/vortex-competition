import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// All competitions: start a new one (copying the setup of the current one),
// close the finished one, reopen an old one, or delete a closed one.
// Only one competition is open at a time; the public forms, club links,
// call room and TV always follow the open competition.
export default function Competitions({ data }) {
  const { meet } = data
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState({ name: '', venue: '', meet_date: '', lanes: 8, positions: true, sponsors: true, clubs: true })

  const load = useCallback(async () => {
    const { data: m } = await supabase.from('vc_meet').select('id,name,venue,meet_date,lanes,is_active,created_at').order('created_at', { ascending: false })
    const rows = m || []
    const counts = await Promise.all(rows.map(async (r) => {
      const [ev, ap, sw] = await Promise.all([
        supabase.from('vc_events').select('id', { count: 'exact', head: true }).eq('meet_id', r.id),
        supabase.from('vc_applications').select('id', { count: 'exact', head: true }).eq('meet_id', r.id),
        supabase.from('vc_swimmers').select('id', { count: 'exact', head: true }).eq('meet_id', r.id)
      ])
      return { events: ev.count || 0, staff: ap.count || 0, swimmers: sw.count || 0 }
    }))
    setList(rows.map((r, i) => ({ ...r, ...counts[i] })))
  }, [])
  useEffect(() => { load() }, [load, meet?.id])

  function startNew() {
    setF({ name: meet?.name || '', venue: meet?.venue || '', meet_date: '', lanes: meet?.lanes || 8, positions: true, sponsors: true, clubs: true })
    setMsg(null); setOpen(true)
  }

  async function create(e) {
    e.preventDefault()
    if (!f.name.trim()) return setMsg({ type: 'error', text: 'Enter the competition name.' })
    if (meet && !window.confirm(`Create "${f.name.trim()}" and close "${meet.name}"? The closed competition and all its data are kept and can be reopened.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('vc_new_competition', {
      p_from: meet?.id || list[0]?.id || null, p_name: f.name, p_venue: f.venue, p_date: f.meet_date, p_lanes: Number(f.lanes) || 8,
      p_copy_positions: f.positions, p_copy_sponsors: f.sponsors, p_copy_clubs: f.clubs, p_activate: true
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: `Could not create the competition: ${error.message}` })
    setOpen(false)
    setMsg({ type: 'ok', text: `"${f.name.trim()}" is now the open competition. Import its heat sheet in Meet Setup, then share the registration and club links again.` })
    await load(); data.reload()
  }

  async function setActive(r, active) {
    const text = active
      ? `Reopen "${r.name}"?${meet && meet.id !== r.id ? ` This closes "${meet.name}".` : ''}`
      : `Close "${r.name}"? Registration forms and club links stop accepting entries until a competition is open. Nothing is deleted.`
    if (!window.confirm(text)) return
    setBusy(true)
    const { error } = await supabase.rpc('vc_set_active_competition', { p_id: r.id, p_active: active })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message })
    setMsg({ type: 'ok', text: active ? `"${r.name}" is open.` : `"${r.name}" is closed.` })
    await load(); data.reload()
  }

  async function rename(r, field, value) {
    const v = String(value).trim()
    if ((r[field] || '') === v || (field === 'name' && !v)) return
    const { error } = await supabase.from('vc_meet').update({ [field]: v || null }).eq('id', r.id)
    if (error) setMsg({ type: 'error', text: error.message })
    else { await load(); if (r.is_active) data.reload() }
  }

  async function remove(r) {
    const typed = window.prompt(`This permanently deletes "${r.name}": its events, heats, staff applications, swimmer records and photos. It cannot be undone.\n\nType DELETE to confirm.`)
    if (typed !== 'DELETE') return
    setBusy(true)
    try {
      // Photos first (files in storage), then the records.
      const [a, s] = await Promise.all([
        supabase.from('vc_applications').select('photo_path').eq('meet_id', r.id),
        supabase.from('vc_swimmers').select('photo_path').eq('meet_id', r.id)
      ])
      const paths = [...(a.data || []), ...(s.data || [])].map((x) => x.photo_path).filter(Boolean)
      for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('vc-photos').remove(paths.slice(i, i + 100))
      if (r.is_active) throw new Error('Close the competition before deleting it.')
      for (const t of ['vc_applications', 'vc_swimmers']) {
        const { error: e1 } = await supabase.from(t).delete().eq('meet_id', r.id)
        if (e1) throw new Error(e1.message)
      }
      await supabase.from('vc_meet').update({ running_heat_id: null }).eq('id', r.id)
      const { error } = await supabase.from('vc_meet').delete().eq('id', r.id)
      if (error) throw new Error(error.message)
      setMsg({ type: 'ok', text: `"${r.name}" was deleted.` })
    } catch (x) { setMsg({ type: 'error', text: `Could not delete: ${x.message}` }) }
    setBusy(false)
    await load()
  }

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18 }}>Competitions</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>One competition is open at a time. Registration forms, club photo links, the call room and the spectator TV always use the open one.</p>
        </div>
        {!open && <button className="btn sm primary" onClick={startNew} disabled={busy}>New competition</button>}
      </div>
      {msg && <div className={`notice ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}

      {open && (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 12, background: 'var(--soft-2)' }}>
          <div style={{ fontWeight: 800 }}>New competition</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label className="field"><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Vortex International Championships 2026 · Short Course" /></label>
            <label className="field"><span className="label">Venue</span><input className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} /></label>
            <label className="field"><span className="label">Dates</span><input className="input" value={f.meet_date} onChange={(e) => set('meet_date', e.target.value)} placeholder="4–5 December 2026" /></label>
            <label className="field"><span className="label">Lanes</span><input className="input num" type="number" min="4" max="10" value={f.lanes} onChange={(e) => set('lanes', e.target.value)} /></label>
          </div>
          <div className="small" style={{ fontWeight: 700 }}>Copy from the current competition</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }} className="small">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.positions} onChange={(e) => set('positions', e.target.checked)} /> Staff positions and pass types</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.sponsors} onChange={(e) => set('sponsors', e.target.checked)} /> Sponsor logos</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.clubs} onChange={(e) => set('clubs', e.target.checked)} /> Club names and logos (new private links)</label>
          </div>
          <div className="small muted">Not copied: the heat sheet, staff applications, swimmer photos and pass holders — each competition collects its own. Pass designs stay the same for every competition.</div>
          <div className="actions">
            <button className="btn sm primary" disabled={busy}>{busy ? 'Creating…' : 'Create and open'}</button>
            <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table">
        <table>
          <thead><tr><th>Competition</th><th>Dates</th><th>Events</th><th>Staff</th><th>Swimmers</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><input className="input" defaultValue={r.name} key={`n-${r.id}-${r.name}`} onBlur={(e) => rename(r, 'name', e.target.value)} style={{ minHeight: 34, fontSize: 13, minWidth: 260 }} aria-label="Competition name" /></td>
                <td><input className="input" defaultValue={r.meet_date || ''} key={`d-${r.id}-${r.meet_date}`} onBlur={(e) => rename(r, 'meet_date', e.target.value)} style={{ minHeight: 34, fontSize: 13, minWidth: 150 }} aria-label="Dates" /></td>
                <td className="num">{r.events}</td>
                <td className="num">{r.staff}</td>
                <td className="num">{r.swimmers}</td>
                <td>{r.is_active ? <span className="chip ok">Open</span> : <span className="chip grey">Closed</span>}</td>
                <td>
                  <div className="actions">
                    {r.is_active
                      ? <button className="btn sm" disabled={busy} onClick={() => setActive(r, false)}>Close</button>
                      : <>
                          <button className="btn sm" disabled={busy} onClick={() => setActive(r, true)}>Reopen</button>
                          <button className="btn sm danger" disabled={busy} onClick={() => remove(r)}>Delete</button>
                        </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
