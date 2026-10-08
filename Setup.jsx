import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { parseCsv } from '../lib.js'

const SAMPLE = `event_no,event_name,heat_no,lane,swimmer_name,club,seed_time
1,Girls 11-12 50m Freestyle,1,3,Swimmer Name,Vortex Aquatics,0:34.20
1,Girls 11-12 50m Freestyle,1,4,Swimmer Name,Al Sadd SC,0:33.10`

export default function Setup({ data }) {
  const { meet, events, order } = data
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const say = (type, text) => setMsg({ type, text })

  // Meet details
  const [form, setForm] = useState({ name: '', venue: '', meet_date: '', lanes: 8 })
  useEffect(() => {
    if (meet) setForm({ name: meet.name || '', venue: meet.venue || '', meet_date: meet.meet_date || '', lanes: meet.lanes || 8 })
  }, [meet?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMeet(e) {
    e.preventDefault()
    const payload = { name: form.name.trim() || 'Vortex Competition', venue: form.venue.trim() || null, meet_date: form.meet_date.trim() || null, lanes: Number(form.lanes) || 8 }
    const { error } = await supabase.from('vc_meet').update(payload).eq('id', meet.id)
    if (error) say('error', error.message); else { say('ok', 'Meet details saved.'); data.reload() }
  }

  // Add event
  const [ev, setEv] = useState({ no: '', name: '', heats: 1 })
  async function addEvent(e) {
    e.preventDefault()
    const no = parseInt(ev.no, 10)
    const nHeats = Math.max(1, parseInt(ev.heats, 10) || 1)
    if (!no || !ev.name.trim()) return say('error', 'Enter the event number and name.')
    setBusy(true)
    const { data: row, error } = await supabase.from('vc_events').insert({ meet_id: meet.id, event_no: no, name: ev.name.trim() }).select().single()
    if (!error) {
      const heats = Array.from({ length: nHeats }, (_, i) => ({ event_id: row.id, heat_no: i + 1 }))
      const r = await supabase.from('vc_heats').insert(heats)
      if (r.error) say('error', r.error.message); else say('ok', `Event ${no} added with ${nHeats} heat${nHeats > 1 ? 's' : ''}.`)
    } else say('error', error.code === '23505' ? `Event ${no} already exists.` : error.message)
    setBusy(false)
    setEv({ no: String(no + 1), name: '', heats: 1 })
    data.reload()
  }

  async function addHeat(event) {
    const max = Math.max(0, ...order.filter((h) => h.event_id === event.id).map((h) => h.heat_no))
    await supabase.from('vc_heats').insert({ event_id: event.id, heat_no: max + 1 })
    data.reload()
  }

  async function deleteEvent(event) {
    if (!window.confirm(`Delete Event ${event.event_no} — ${event.name} and all its heats and entries?`)) return
    const { error } = await supabase.from('vc_events').delete().eq('id', event.id)
    if (error) say('error', error.message); else say('ok', `Event ${event.event_no} deleted.`)
    data.reload()
  }

  // CSV import
  const [csv, setCsv] = useState('')
  async function importCsv() {
    let rows = parseCsv(csv)
    if (rows.length && isNaN(parseInt(rows[0][0], 10))) rows = rows.slice(1)
    rows = rows.filter((r) => r.length >= 5 && parseInt(r[0], 10) && parseInt(r[2], 10) && parseInt(r[3], 10) && r[4])
    if (!rows.length) return say('error', 'No valid rows found. Use: event_no, event_name, heat_no, lane, swimmer_name, club, seed_time')
    setBusy(true)
    try {
      const evMap = new Map()
      rows.forEach((r) => { const n = parseInt(r[0], 10); if (!evMap.has(n)) evMap.set(n, r[1] || `Event ${n}`) })
      const { data: evRows, error: e1 } = await supabase.from('vc_events')
        .upsert([...evMap].map(([n, name]) => ({ meet_id: meet.id, event_no: n, name })), { onConflict: 'meet_id,event_no' }).select()
      if (e1) throw e1
      const evId = new Map(evRows.map((x) => [x.event_no, x.id]))
      const heatKeys = new Map()
      rows.forEach((r) => { const k = `${parseInt(r[0], 10)}-${parseInt(r[2], 10)}`; heatKeys.set(k, { event_id: evId.get(parseInt(r[0], 10)), heat_no: parseInt(r[2], 10) }) })
      const { data: hRows, error: e2 } = await supabase.from('vc_heats').upsert([...heatKeys.values()], { onConflict: 'event_id,heat_no' }).select()
      if (e2) throw e2
      const hId = new Map(hRows.map((h) => [`${h.event_id}-${h.heat_no}`, h.id]))
      const entries = new Map()
      rows.forEach((r) => {
        const heat_id = hId.get(`${evId.get(parseInt(r[0], 10))}-${parseInt(r[2], 10)}`)
        const lane = parseInt(r[3], 10)
        entries.set(`${heat_id}-${lane}`, { heat_id, lane, swimmer_name: r[4], club: r[5] || null, seed_time: r[6] || null })
      })
      const { error: e3 } = await supabase.from('vc_entries').upsert([...entries.values()], { onConflict: 'heat_id,lane' })
      if (e3) throw e3
      say('ok', `Imported ${entries.size} entries across ${heatKeys.size} heats and ${evMap.size} events.`)
      setCsv('')
    } catch (err) {
      say('error', err.message)
    }
    setBusy(false)
    data.reload()
  }
  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(setCsv)
  }

  async function loadDemo() {
    const demo = [
      [1, 'Girls 11-12 50m Freestyle', 2], [2, 'Boys 11-12 50m Freestyle', 2],
      [3, 'Girls 13-14 100m Backstroke', 2], [4, 'Boys 13-14 100m Backstroke', 2]
    ]
    const clubs = ['Vortex Aquatics', 'Al Sadd SC', 'Qatar SC', 'Al Arabi SC', 'Al Rayyan SC', 'Al Gharafa SC']
    const lines = []
    demo.forEach(([no, name, heats]) => {
      for (let h = 1; h <= heats; h++) for (let l = 1; l <= (meet.lanes || 8); l++) {
        lines.push(`${no},${name},${h},${l},Demo Swimmer ${no}-${h}-${l},${clubs[(no + h + l) % clubs.length]},`)
      }
    })
    setCsv(lines.join('\n'))
    say('ok', 'Demo heat sheet placed in the import box — press Import to load it. Delete the demo events before the real meet.')
  }

  async function resetProgress() {
    if (!window.confirm('Reset all call stages, check-ins, scratches and the running heat? Events and entries stay.')) return
    const heatIds = order.map((h) => h.id)
    if (heatIds.length) {
      await supabase.from('vc_heats').update({ call_stage: 0 }).in('id', heatIds)
      await supabase.from('vc_entries').update({ checked_in: false, scratched: false }).in('heat_id', heatIds)
    }
    await supabase.from('vc_meet').update({ running_heat_id: null }).eq('id', meet.id)
    say('ok', 'Meet progress reset.')
    data.reload()
  }

  // Organizer access
  const [admins, setAdmins] = useState([])
  const [newAdmin, setNewAdmin] = useState('')
  const [me, setMe] = useState('')
  const loadAdmins = () => supabase.from('vc_admins').select('*').order('added_at').then(({ data }) => setAdmins(data || []))
  useEffect(() => {
    loadAdmins()
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.email || ''))
  }, [])
  async function addAdmin(e) {
    e.preventDefault()
    const email = newAdmin.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('error', 'Enter a valid email.')
    const { error } = await supabase.from('vc_admins').insert({ email })
    if (error) say('error', error.code === '23505' ? 'Already on the list.' : error.message)
    else { say('ok', `${email} can now open the console after signing in.`); setNewAdmin('') }
    loadAdmins()
  }
  async function removeAdmin(email) {
    if (!window.confirm(`Remove organizer access for ${email}?`)) return
    await supabase.from('vc_admins').delete().eq('email', email)
    loadAdmins()
  }

  if (!meet) return <div className="notice error">No active meet found.</div>

  const heatsFor = (id) => order.filter((h) => h.event_id === id).length

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }} aria-label="Meet setup">
      {msg && <div className={`notice ${msg.type}`} role="status">{msg.text}</div>}

      <div className="split">
        <form className="card side" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 'none' }} onSubmit={saveMeet}>
          <h2 style={{ fontSize: 18 }}>Meet details</h2>
          <div className="field"><label htmlFor="mn">Meet name</label><input id="mn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="mv">Venue</label><input id="mv" className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div className="field"><label htmlFor="md">Date(s)</label><input id="md" className="input" placeholder="e.g. 14–15 Nov 2026" value={form.meet_date} onChange={(e) => setForm({ ...form, meet_date: e.target.value })} /></div>
            <div className="field"><label htmlFor="ml">Lanes</label><input id="ml" className="input" type="number" min="4" max="10" value={form.lanes} onChange={(e) => setForm({ ...form, lanes: e.target.value })} /></div>
          </div>
          <button className="btn primary">Save meet details</button>
          <div className="sep" />
          <button type="button" className="btn danger" onClick={resetProgress}>Reset meet progress</button>
        </form>

        <div className="main">
          <form className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={addEvent}>
            <h2 style={{ fontSize: 18 }}>Add an event</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr) 100px auto', gap: 10, alignItems: 'end' }}>
              <div className="field"><label htmlFor="eno">Event #</label><input id="eno" className="input" type="number" min="1" value={ev.no} onChange={(e) => setEv({ ...ev, no: e.target.value })} /></div>
              <div className="field"><label htmlFor="ena">Event name</label><input id="ena" className="input" placeholder="Girls 13-14 200m IM" value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="ehe">Heats</label><input id="ehe" className="input" type="number" min="1" value={ev.heats} onChange={(e) => setEv({ ...ev, heats: e.target.value })} /></div>
              <button className="btn primary" disabled={busy}>Add</button>
            </div>
          </form>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <h2 style={{ fontSize: 18 }}>Import heat sheet (CSV)</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label className="btn sm" style={{ cursor: 'pointer' }}>Choose CSV file<input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ display: 'none' }} /></label>
                {!events.length && <button type="button" className="btn sm" onClick={loadDemo}>Load demo heats</button>}
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>One row per swimmer: <b>event_no, event_name, heat_no, lane, swimmer_name, club, seed_time</b>. Export from Meet Manager / Excel, or paste below. Re-importing updates existing lanes.</p>
            <textarea className="input" aria-label="CSV rows" placeholder={SAMPLE} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !csv.trim()} onClick={importCsv}>{busy ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      </div>

      <div className="table">
        <table>
          <thead><tr><th style={{ width: 90 }}>Event</th><th>Name</th><th style={{ width: 90 }}>Heats</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={4} className="empty">No events yet.</td></tr>}
            {events.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 800 }}>{e.event_no}</td>
                <td>{e.name}</td>
                <td className="num">{heatsFor(e.id)}</td>
                <td><div className="actions"><button className="btn sm" onClick={() => addHeat(e)}>Add heat</button><button className="btn sm danger" onClick={() => deleteEvent(e)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 18 }}>Organizer access</h2>
        <p className="small muted" style={{ margin: 0 }}>Only these emails can open the console and call room screen. Each person signs in (or creates an account) with the same email.</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={addAdmin}>
          <input className="input" style={{ flex: '1 1 260px', width: 'auto' }} type="email" placeholder="name@example.com" aria-label="Organizer email" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
          <button className="btn primary">Add organizer</button>
        </form>
        <div className="pills">
          {admins.map((a) => (
            <span key={a.email} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38 }}>
              {a.email}
              {a.email !== me && <button className="btn sm" style={{ minHeight: 26, padding: '0 8px' }} aria-label={`Remove ${a.email}`} onClick={() => removeAdmin(a.email)}>Remove</button>}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
