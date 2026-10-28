import { useMemo, useState } from 'react'
import logoH from './logo-horizontal.svg'
import { useMeet } from './useMeet.js'
import { Avatar, usePeople } from './photos.jsx'

// Printable heat sheet for officials, with swimmer photos next to their names.
export default function HeatSheet() {
  const data = useMeet()
  const { meet, events, order, entries, loading, apps } = data
  const people = usePeople(apps)
  const [ev, setEv] = useState('all')
  const [onlyPhotos, setOnlyPhotos] = useState(false)

  const byHeat = useMemo(() => {
    const m = {}
    entries.forEach((e) => { (m[e.heat_id] = m[e.heat_id] || []).push(e) })
    Object.values(m).forEach((l) => l.sort((a, b) => a.lane - b.lane))
    return m
  }, [entries])

  const heats = order.filter((h) => (ev === 'all' || String(h.event_no) === ev) && (byHeat[h.id] || []).length)
  const groups = []
  heats.forEach((h) => {
    let g = groups[groups.length - 1]
    if (!g || g.no !== h.event_no) { g = { no: h.event_no, name: h.event_name, heats: [] }; groups.push(g) }
    g.heats.push(h)
  })
  const withPhoto = entries.filter((e) => people.photoForEntry(e)).length

  return (
    <div className="hs">
      <div className="hs-controls no-print">
        <img src={logoH} alt="Vortex Swimming Club" style={{ height: 36 }} />
        <select className="input" style={{ width: 'auto', minWidth: 220 }} value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Event">
          <option value="all">All events</option>
          {events.map((e) => <option key={e.id} value={String(e.event_no)}>#{e.event_no} {e.name}</option>)}
        </select>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyPhotos} onChange={(e) => setOnlyPhotos(e.target.checked)} style={{ accentColor: '#1f23c9' }} /> Show photo column only where a photo exists
        </label>
        <span className="small muted">{withPhoto} of {entries.length} swims have a photo</span>
        <button className="btn sm primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <div className="hs-head">
        <img src={logoH} alt="" style={{ height: 40 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--navy)' }}>{meet?.name || 'Heat sheet'}</div>
          <div className="small muted">{[meet?.venue, meet?.meet_date].filter(Boolean).join(' · ')} · Officials’ heat sheet — not for public display</div>
        </div>
      </div>

      {loading ? <div className="empty">Loading…</div> : !groups.length ? <div className="empty">No heats with swimmers yet.</div> : (
        <div className="hs-cols">
          {groups.map((g) => (
            <div key={g.no} className="hs-event">
              <div className="hs-event-title">Event {g.no} · {g.name}</div>
              {g.heats.map((h) => {
                const list = byHeat[h.id] || []
                const any = list.some((e) => people.photoForEntry(e))
                return (
                  <div key={h.id} className="hs-heat">
                    <div className="hs-heat-title">Heat {h.heat_no} of {h.heat_total}</div>
                    <table>
                      <tbody>
                        {list.map((e) => {
                          const src = people.photoForEntry(e)
                          return (
                            <tr key={e.id} style={{ opacity: e.scratched ? 0.45 : 1 }}>
                              <td className="hs-lane">{e.lane}</td>
                              {(!onlyPhotos || any) && <td style={{ width: 34 }}>{src ? <img src={src} alt="" className="hs-photo" /> : <Avatar name={e.swimmer_name} size={26} radius={5} />}</td>}
                              <td style={{ fontWeight: 700 }}>{e.swimmer_name}</td>
                              <td className="muted">{e.club}</td>
                              <td className="num" style={{ textAlign: 'right' }}>{e.scratched ? 'SCR' : e.seed_time || 'NT'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      {meet?.sponsor_banner && <img src={meet.sponsor_banner} alt="Meet sponsors" style={{ display: 'block', margin: '24px auto 0', maxWidth: '100%', maxHeight: 70 }} />}
    </div>
  )
}
