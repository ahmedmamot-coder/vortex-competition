import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { parseCsv } from './lib.js'

const SAMPLE = `event_no,event_name,heat_no,lane,swimmer_name,club,seed_time
1,Girls 11-12 50m Freestyle,1,3,Swimmer Name,Vortex Aquatics,0:34.20
1,Girls 11-12 50m Freestyle,1,4,Swimmer Name,Al Sadd SC,0:33.10`

function titleCase(t) {
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

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

  // Heat sheet import (HY-TEK PDF or CSV)
  const [csv, setCsv] = useState('')
  const [pdfResult, setPdfResult] = useState(null)
  const [replace, setReplace] = useState(true)
  const [useTitle, setUseTitle] = useState(true)
  const [reading, setReading] = useState(false)

  async function importRows(rows, { replaceAll = false } = {}) {
    const n = (v) => parseInt(v, 10)
    if (replaceAll && events.length) {
      const { error } = await supabase.from('vc_events').delete().eq('meet_id', meet.id)
      if (error) throw error
    }
    const evMap = new Map()
    rows.forEach((r) => { if (!evMap.has(n(r[0]))) evMap.set(n(r[0]), r[1] || `Event ${n(r[0])}`) })
    const { data: evRows, error: e1 } = await supabase.from('vc_events')
      .upsert([...evMap].map(([no, name]) => ({ meet_id: meet.id, event_no: no, name })), { onConflict: 'meet_id,event_no' }).select()
    if (e1) throw e1
    const evId = new Map(evRows.map((x) => [x.event_no, x.id]))
    const heatKeys = new Map()
    rows.forEach((r) => heatKeys.set(`${n(r[0])}-${n(r[2])}`, { event_id: evId.get(n(r[0])), heat_no: n(r[2]) }))
    const heatList = [...heatKeys.values()]
    const hId = new Map()
    for (let i = 0; i < heatList.length; i += 400) {
      const { data: hRows, error: e2 } = await supabase.from('vc_heats').upsert(heatList.slice(i, i + 400), { onConflict: 'event_id,heat_no' }).select('id,event_id,heat_no')
      if (e2) throw e2
      hRows.forEach((h) => hId.set(`${h.event_id}-${h.heat_no}`, h.id))
    }
    const entries = new Map()
    rows.forEach((r) => {
      const heat_id = hId.get(`${evId.get(n(r[0]))}-${n(r[2])}`)
      entries.set(`${heat_id}-${n(r[3])}`, { heat_id, lane: n(r[3]), swimmer_name: String(r[4]).slice(0, 200), club: r[5] ? String(r[5]).slice(0, 300) : null, seed_time: r[6] || null })
    })
    const list = [...entries.values()]
    for (let i = 0; i < list.length; i += 500) {
      const { error: e3 } = await supabase.from('vc_entries').upsert(list.slice(i, i + 500), { onConflict: 'heat_id,lane' })
      if (e3) throw e3
    }
    return { entries: list.length, heats: heatList.length, events: evMap.size }
  }

  async function importCsv() {
    let rows = parseCsv(csv)
    if (rows.length && isNaN(parseInt(rows[0][0], 10))) rows = rows.slice(1)
    rows = rows.filter((r) => r.length >= 5 && parseInt(r[0], 10) && parseInt(r[2], 10) && !isNaN(parseInt(r[3], 10)) && r[4])
    if (!rows.length) return say('error', 'No valid rows found. Use: event_no, event_name, heat_no, lane, swimmer_name, club, seed_time')
    setBusy(true)
    try {
      const r = await importRows(rows)
      say('ok', `Imported ${r.entries} entries across ${r.heats} heats and ${r.events} events.`)
      setCsv('')
    } catch (err) { say('error', err.message) }
    setBusy(false)
    data.reload()
  }

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPdfResult(null)
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      setReading(true); setMsg(null)
      try {
        const { readHeatSheetPdf } = await import('./heatsheet.js')
        const res = await readHeatSheetPdf(f)
        if (!res.rows.length) say('error', 'No heats found in this PDF. It should be a HY-TEK Meet Manager meet program / heat sheet.')
        else setPdfResult({ ...res, fileName: f.name })
      } catch (err) {
        say('error', `Could not read the PDF: ${err.message}`)
      }
      setReading(false)
    } else {
      f.text().then(setCsv)
    }
  }

  async function importPdf() {
    if (!pdfResult) return
    if (replace && events.length && !window.confirm(`Replace all ${events.length} current events (and their call-room progress) with the ${pdfResult.events} events from ${pdfResult.fileName}?`)) return
    setBusy(true)
    try {
      const r = await importRows(pdfResult.rows, { replaceAll: replace })
      const lanes = pdfResult.rows.map((x) => x[3])
      const patch = { lanes: Math.min(10, Math.max(4, Math.max(...lanes) - Math.min(...lanes) + 1)) }
      if (useTitle && pdfResult.title) { patch.name = titleCase(pdfResult.title); if (pdfResult.dates) patch.meet_date = pdfResult.dates }
      if (pdfResult.sponsor && pdfResult.useSponsor !== false) patch.sponsor_banner = pdfResult.sponsor
      await supabase.from('vc_meet').update(patch).eq('id', meet.id)
      say('ok', `Imported ${r.entries} entries across ${r.heats} heats and ${r.events} events${patch.sponsor_banner ? ', plus the sponsor banner' : ''}.`)
      setPdfResult(null)
    } catch (err) { say('error', err.message) }
    setBusy(false)
    data.reload()
  }

  // Sponsor banner
  async function onSponsorFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { imageFileToDataUrl } = await import('./heatsheet.js')
      const url = await imageFileToDataUrl(f)
      const { error } = await supabase.from('vc_meet').update({ sponsor_banner: url }).eq('id', meet.id)
      if (error) say('error', error.message); else say('ok', 'Sponsor banner updated.')
    } catch (err) { say('error', `Could not read the image: ${err.message}`) }
    data.reload()
  }
  async function removeSponsor() {
    if (!window.confirm('Remove the sponsor banner?')) return
    await supabase.from('vc_meet').update({ sponsor_banner: null }).eq('id', meet.id)
    data.reload()
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
              <h2 style={{ fontSize: 18 }}>Import heat sheet</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label className="btn sm primary" style={{ cursor: 'pointer' }}>
                  {reading ? 'Reading PDF…' : 'Upload PDF or CSV'}
                  <input type="file" accept=".pdf,application/pdf,.csv,text/csv,text/plain" onChange={onFile} disabled={reading} style={{ display: 'none' }} />
                </label>
                {!events.length && <button type="button" className="btn sm" onClick={loadDemo}>Load demo heats</button>}
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              <b>PDF:</b> the HY-TEK Meet Manager meet program / heat sheet — events, heats, lanes, swimmers, clubs, seed times and relays are read automatically, and the sponsor logos at the bottom of the page become the sponsor banner.{' '}
              <b>CSV:</b> one row per swimmer: event_no, event_name, heat_no, lane, swimmer_name, club, seed_time.
            </p>

            {pdfResult && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--soft-2)' }}>
                <div className="eyebrow blue">Ready to import · {pdfResult.fileName}</div>
                {pdfResult.title && <div style={{ fontWeight: 800, fontSize: 17 }}>{titleCase(pdfResult.title)}{pdfResult.dates ? <span className="muted" style={{ fontWeight: 500 }}> · {pdfResult.dates}</span> : null}</div>}
                <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  <div className="card" style={{ padding: 12 }}><div className="eyebrow">Events</div><div className="kpi">{pdfResult.events}</div></div>
                  <div className="card" style={{ padding: 12 }}><div className="eyebrow">Heats</div><div className="kpi">{pdfResult.heats}</div></div>
                  <div className="card" style={{ padding: 12 }}><div className="eyebrow">Entries</div><div className="kpi">{pdfResult.rows.length}</div></div>
                </div>
                {pdfResult.unmatched.length > 0 && (
                  <div className="notice">{pdfResult.unmatched.length} line(s) could not be read and will be skipped, e.g. “{pdfResult.unmatched[0]}”.</div>
                )}
                {pdfResult.sponsor ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="label">Sponsor banner found</div>
                    <img src={pdfResult.sponsor} alt="Sponsor logos from the PDF" style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain', alignSelf: 'flex-start', background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }} />
                    <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={pdfResult.useSponsor !== false} onChange={(e) => setPdfResult({ ...pdfResult, useSponsor: e.target.checked })} /> Use these logos as the sponsor banner
                    </label>
                  </div>
                ) : <div className="small muted">No sponsor logos found at the bottom of page 1.</div>}
                <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={useTitle} onChange={(e) => setUseTitle(e.target.checked)} /> Update the meet name and dates from the PDF
                </label>
                {events.length > 0 && (
                  <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace the {events.length} events already in the meet (recommended for a new heat sheet)
                  </label>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary" disabled={busy} onClick={importPdf}>{busy ? 'Importing…' : `Import ${pdfResult.rows.length} entries`}</button>
                  <button className="btn" disabled={busy} onClick={() => setPdfResult(null)}>Cancel</button>
                </div>
              </div>
            )}

            <textarea className="input" aria-label="CSV rows" placeholder={SAMPLE} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ minHeight: 100 }} />
            <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy || !csv.trim()} onClick={importCsv}>{busy ? 'Importing…' : 'Import CSV rows'}</button>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <h2 style={{ fontSize: 18 }}>Sponsor banner</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label className="btn sm" style={{ cursor: 'pointer' }}>Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onSponsorFile} style={{ display: 'none' }} /></label>
                {meet.sponsor_banner && <button className="btn sm danger" onClick={removeSponsor}>Remove</button>}
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Shown on the staff registration form, the call room screen and the console. Comes from the heat sheet PDF automatically, or upload a logo strip.</p>
            {meet.sponsor_banner
              ? <img src={meet.sponsor_banner} alt="Current sponsor banner" style={{ maxWidth: '100%', maxHeight: 110, objectFit: 'contain', alignSelf: 'flex-start' }} />
              : <div className="small muted">No sponsor banner yet.</div>}
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
