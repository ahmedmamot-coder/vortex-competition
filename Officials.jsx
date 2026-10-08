import { supabase } from '../supabase.js'

export default function Officials({ data }) {
  const { positions, apps } = data
  const approved = apps.filter((a) => a.status === 'approved')
  const groups = []
  positions.forEach((p) => {
    let g = groups.find((x) => x.name === p.group_name)
    if (!g) { g = { name: p.group_name, items: [] }; groups.push(g) }
    g.items.push(p)
  })

  async function setRequired(p, value) {
    const n = Math.max(0, parseInt(value, 10) || 0)
    if (n === p.required) return
    data.setPositions((ps) => ps.map((x) => (x.id === p.id ? { ...x, required: n } : x)))
    await supabase.from('vc_positions').update({ required: n }).eq('id', p.id)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }} aria-label="Officials and positions">
      <div>
        <h2 style={{ fontSize: 24 }}>Officials &amp; positions</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>Required crew against approved staff. Change the number needed in each card; approving an application fills its position.</p>
      </div>
      {groups.map((g) => (
        <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="eyebrow blue">{g.name}</h3>
          <div className="pos-grid">
            {g.items.map((p) => {
              const people = approved.filter((a) => a.position === p.name)
              const filled = people.length
              const full = filled >= p.required
              const pct = p.required ? Math.min(100, Math.round((filled / p.required) * 100)) : 100
              return (
                <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="num" style={{ fontWeight: 800, color: full ? 'var(--blue)' : 'var(--warn)' }}>{filled} /</span>
                      <input
                        aria-label={`${p.name} required`}
                        className="input num"
                        style={{ width: 64, minHeight: 34, padding: '0 8px', fontWeight: 800 }}
                        type="number" min="0" defaultValue={p.required}
                        onBlur={(e) => setRequired(p, e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="bar"><div style={{ width: `${pct}%`, background: full ? 'var(--blue)' : 'var(--blue-2)' }} /></div>
                  {p.note && <div className="small muted">{p.note}</div>}
                  {people.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                      {people.map((a) => <li key={a.id}>{a.full_name} <span className="muted">· +974 {a.mobile}</span></li>)}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
