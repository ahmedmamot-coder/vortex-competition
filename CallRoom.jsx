import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { STAGES, announceText, heatCode, statusFor } from './lib.js'

export default function CallRoom({ data, onGoSetup }) {
  const { order, runIdx, entries, meet, laneStart } = data
  const [selId, setSelId] = useState(null)

  // Default selection: first heat after the one racing that is not yet released.
  useEffect(() => {
    if (selId && order.some((h) => h.id === selId)) return
    const start = Math.max(runIdx + 1, 0)
    const h = order.slice(start).find((x) => x.call_stage < 4) || order[start] || order[0]
    if (h) setSelId(h.id)
  }, [order, runIdx, selId])

  const selIdx = order.findIndex((h) => h.id === selId)
  const sel = order[selIdx]
  const lanes = useMemo(() => {
    if (!sel) return []
    const n = meet?.lanes || 8
    const byLane = new Map(entries.filter((e) => e.heat_id === sel.id).map((e) => [e.lane, e]))
    const out = []
    for (let l = laneStart; l < laneStart + n; l++) out.push(byLane.get(l) || { lane: l, empty: true })
    return out
  }, [sel, entries, meet, laneStart])

  const [autoTv, setAutoTv] = useState(() => { try { return localStorage.getItem('vc-auto-tv') !== '0' } catch { return true } })
  const [custom, setCustom] = useState('')
  const [tvNote, setTvNote] = useState('')

  if (!order.length) {
    return (
      <div className="card empty">
        <h2 style={{ fontSize: 20, marginBottom: 8, color: 'var(--navy)' }}>No heats yet</h2>
        <p>Add events and import the heat sheet in Meet Setup to start running the call room.</p>
        <button className="btn primary" onClick={onGoSetup}>Go to Meet Setup</button>
      </div>
    )
  }

  const stage = sel?.call_stage || 0
  const active = lanes.filter((l) => !l.empty && !l.scratched)
  const checked = active.filter((l) => l.checked_in).length
  const scratched = lanes.filter((l) => !l.empty && l.scratched).length

  async function setStage(h, s) {
    const updated_at = new Date().toISOString()
    data.setHeats((hs) => hs.map((x) => (x.id === h.id ? { ...x, call_stage: s, updated_at } : x)))
    await supabase.from('vc_heats').update({ call_stage: s, updated_at }).eq('id', h.id)
    if (autoTv && s >= 1 && s <= 3) announce(h, s)
  }

  // ---- Spectator TV voice-over ----
  function toggleAutoTv(v) { setAutoTv(v); try { localStorage.setItem('vc-auto-tv', v ? '1' : '0') } catch { /* ignore */ } }
  async function announce(h, s) {
    const { error } = await supabase.from('vc_announcements').insert({ meet_id: meet.id, heat_id: h.id, stage: s })
    setTvNote(error ? `TV announcement failed: ${error.message}` : `Announced on the spectator TV: ${['', '1st', '2nd', 'final'][s]} call, ${heatCode(h)}`)
  }
  async function announceCustom(e) {
    e.preventDefault()
    const message = custom.trim()
    if (!message) return
    const { error } = await supabase.from('vc_announcements').insert({ meet_id: meet.id, message: message.slice(0, 400) })
    setTvNote(error ? `TV announcement failed: ${error.message}` : 'Custom announcement sent to the spectator TV.')
    if (!error) setCustom('')
  }
  async function patchEntry(e, patch) {
    data.setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, ...patch } : x)))
    await supabase.from('vc_entries').update(patch).eq('id', e.id)
  }
  async function checkAll() {
    const ids = active.filter((l) => !l.checked_in).map((l) => l.id)
    if (!ids.length) return
    data.setEntries((es) => es.map((x) => (ids.includes(x.id) ? { ...x, checked_in: true } : x)))
    await supabase.from('vc_entries').update({ checked_in: true }).in('id', ids)
  }
  function primary() {
    if (stage < 4) setStage(sel, stage + 1)
    else if (order[selIdx + 1]) setSelId(order[selIdx + 1].id)
  }
  const btnLabel = ['Make 1st call', 'Make 2nd call', 'Make final call', 'Release to blocks', 'Go to next heat'][stage]
  const selStatus = selIdx < runIdx ? 'Completed' : selIdx === runIdx ? 'Racing now' : STAGES[stage]

  return (
    <section className="split" aria-label="Call room">
      <div className="side list">
        <div className="list-head">
          <h2 style={{ fontSize: 17 }}>Heat order</h2>
          <span className="small muted">{order.length} heats</span>
        </div>
        <div className="list-scroll">
          {order.map((h, i) => {
            const st = statusFor(i, runIdx, h.call_stage)
            return (
              <button key={h.id} className={`qrow ${h.id === selId ? 'sel' : ''}`} onClick={() => setSelId(h.id)}>
                <span className="code">{heatCode(h)}</span>
                <span className="nm">{h.event_name}</span>
                <span className={`chip ${st.cls}`}>{st.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {sel && (
        <div className="main">
          <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="eyebrow blue">Call room · {selStatus}</div>
                <h2 style={{ fontSize: 28 }}>Event {sel.event_no} · Heat {sel.heat_no} of {sel.heat_total}</h2>
                <div style={{ color: 'var(--ink-2)' }}>{sel.event_name}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" aria-label="Previous heat" disabled={selIdx <= 0} onClick={() => setSelId(order[selIdx - 1].id)}>
                  <Chevron dir="left" />
                </button>
                <button className="btn" aria-label="Next heat" disabled={selIdx >= order.length - 1} onClick={() => setSelId(order[selIdx + 1].id)}>
                  <Chevron dir="right" />
                </button>
              </div>
            </div>

            <ol className="stages" aria-label="Call stages">
              {STAGES.map((n, i) => (
                <li key={n} className={`${i <= stage ? 'on' : ''} ${i === 3 && stage === 3 ? 'final' : ''}`}>
                  <span className="b" />{n}
                </li>
              ))}
            </ol>

            <div className="announce">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f23c9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></svg>
              <div>
                <div className="eyebrow blue" style={{ fontSize: 11 }}>Announcer script</div>
                <div style={{ fontWeight: 600 }}>{announceText(sel, stage)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button className="btn primary" style={{ minHeight: 48 }} onClick={primary} disabled={stage === 4 && selIdx >= order.length - 1}>{btnLabel}</button>
              <button className="btn" onClick={checkAll}>Check in all present</button>
              <button className="btn" onClick={() => setStage(sel, 0)}>Reset heat</button>
              <button className="btn" disabled={stage < 1 || stage > 3} onClick={() => announce(sel, stage)} title="Read this call out again on the spectator TV">Announce again on TV</button>
              <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                {checked} / {active.length} checked in <span className="muted" style={{ fontWeight: 500 }}>· {scratched} scratched</span>
              </span>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="eyebrow blue" style={{ fontSize: 11 }}>Spectator TV</span>
                <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={autoTv} onChange={(e) => toggleAutoTv(e.target.checked)} /> Read each call out loud on the TV automatically
                </label>
                {meet?.display_key && <a className="small" href={`/tv?key=${meet.display_key}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open TV screen</a>}
              </div>
              <form onSubmit={announceCustom} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 280px', width: 'auto', minHeight: 40 }} maxLength={400} placeholder="Custom announcement, e.g. All Event 12 swimmers to the call room (English or Arabic)" aria-label="Custom TV announcement" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button className="btn sm dark" style={{ minHeight: 40 }} disabled={!custom.trim()}>Announce</button>
              </form>
              {tvNote && <div className="small muted" role="status">{tvNote}</div>}
            </div>
          </div>

          <div className="table">
            <table>
              <thead>
                <tr><th style={{ width: 70 }}>Lane</th><th>Swimmer</th><th>Club</th><th>Seed</th><th>Status</th><th style={{ textAlign: 'right', minWidth: 250 }}>Action</th></tr>
              </thead>
              <tbody>
                {lanes.map((l) => (
                  <LaneRow key={l.empty ? `e${l.lane}` : l.id} l={l} heat={sel} lanes={lanes} data={data} onToggleCheck={() => patchEntry(l, { checked_in: !l.checked_in })} onToggleScratch={() => patchEntry(l, { scratched: !l.scratched, checked_in: false })} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// One lane of the selected heat: shows the swimmer, or lets the organizer add / edit / remove one.
function LaneRow({ l, heat, lanes, data, onToggleCheck, onToggleScratch }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ swimmer_name: '', club: '', seed_time: '', lane: l.lane })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function start() {
    setF({ swimmer_name: l.swimmer_name || '', club: l.club || '', seed_time: l.seed_time || '', lane: l.lane })
    setErr(''); setEditing(true)
  }
  async function save(e) {
    e.preventDefault()
    const name = f.swimmer_name.trim()
    if (!name) return setErr('Enter the swimmer name.')
    const lane = parseInt(f.lane, 10)
    const taken = lanes.find((x) => !x.empty && x.lane === lane && x.id !== l.id)
    if (Number.isNaN(lane)) return setErr('Choose a lane.')
    if (taken) return setErr(`Lane ${lane} already has ${taken.swimmer_name}.`)
    setBusy(true)
    const row = { swimmer_name: name.slice(0, 200), club: f.club.trim() || null, seed_time: f.seed_time.trim() || null, lane }
    const { error } = l.empty
      ? await supabase.from('vc_entries').insert({ ...row, heat_id: heat.id })
      : await supabase.from('vc_entries').update(row).eq('id', l.id)
    setBusy(false)
    if (error) return setErr(error.message)
    setEditing(false)
    data.reload()
  }
  async function remove() {
    if (!window.confirm(`Remove ${l.swimmer_name} from lane ${l.lane}?`)) return
    const { error } = await supabase.from('vc_entries').delete().eq('id', l.id)
    if (error) return setErr(error.message)
    setEditing(false)
    data.reload()
  }

  if (editing) {
    return (
      <tr>
        <td><span className="lane">{l.lane}</span></td>
        <td colSpan={5}>
          <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" style={{ flex: '2 1 200px', width: 'auto', minHeight: 38 }} placeholder="Swimmer name (Last, First)" aria-label="Swimmer name" value={f.swimmer_name} onChange={(e) => setF({ ...f, swimmer_name: e.target.value })} autoFocus />
            <input className="input" style={{ flex: '1 1 110px', width: 'auto', minHeight: 38 }} placeholder="Club" aria-label="Club" value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} />
            <input className="input num" style={{ flex: '0 1 110px', width: 'auto', minHeight: 38 }} placeholder="Seed e.g. 1:05.32" aria-label="Seed time" value={f.seed_time} onChange={(e) => setF({ ...f, seed_time: e.target.value })} />
            {!l.empty && (
              <select className="input" style={{ width: 'auto', minHeight: 38 }} aria-label="Lane" value={f.lane} onChange={(e) => setF({ ...f, lane: e.target.value })}>
                {lanes.map((x) => <option key={x.lane} value={x.lane}>Lane {x.lane}</option>)}
              </select>
            )}
            <button className="btn sm primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
            {!l.empty && <button type="button" className="btn sm danger" onClick={remove}>Remove swimmer</button>}
            {err && <span className="err-text" style={{ flexBasis: '100%' }}>{err}</span>}
          </form>
        </td>
      </tr>
    )
  }

  if (l.empty) {
    return (
      <tr>
        <td><span className="lane">{l.lane}</span></td>
        <td colSpan={4} className="muted small">Empty lane</td>
        <td><div className="actions"><button className="btn sm" onClick={start}>Add swimmer</button></div></td>
      </tr>
    )
  }

  return (
    <tr className={l.scratched ? 'scratched' : ''}>
      <td><span className="lane">{l.lane}</span></td>
      <td style={{ fontWeight: 700 }}>{l.swimmer_name}</td>
      <td className="small" style={{ color: 'var(--ink-2)' }}>{l.club}</td>
      <td className="num" style={{ fontWeight: 600 }}>{l.seed_time || 'NT'}</td>
      <td>
        <span className={`chip ${l.scratched ? 'grey' : l.checked_in ? 'ok' : 'warn'}`}>{l.scratched ? 'Scratched' : l.checked_in ? 'Present' : 'Not in'}</span>
      </td>
      <td>
        <div className="actions">
          <button className={`btn sm ${l.checked_in ? 'dark' : ''}`} disabled={l.scratched} onClick={onToggleCheck}>{l.checked_in ? 'Present' : 'Check in'}</button>
          <button className="btn sm" onClick={onToggleScratch}>{l.scratched ? 'Restore' : 'Scratch'}</button>
          <button className="btn sm" onClick={start} aria-label={`Edit lane ${l.lane}`}>Edit</button>
        </div>
      </td>
    </tr>
  )
}

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}
