import { useMemo } from 'react'
import logoH from './logo-horizontal.svg'
import { useMeet } from './useMeet.js'

// Full-screen call room display. Shows the heat most recently called (1st / 2nd / final),
// otherwise the next heat to be called. Updates live.
export default function Board() {
  const { meet, order, runIdx, entries, loading, laneStart } = useMeet()

  const shown = useMemo(() => {
    const after = order.slice(Math.max(runIdx + 1, 0))
    const calling = after.filter((h) => h.call_stage >= 1 && h.call_stage <= 3)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]
    return calling || after.find((h) => h.call_stage === 0) || null
  }, [order, runIdx])

  const lanes = useMemo(() => {
    if (!shown) return []
    const n = meet?.lanes || 8
    const byLane = new Map(entries.filter((e) => e.heat_id === shown.id).map((e) => [e.lane, e]))
    return Array.from({ length: n }, (_, i) => byLane.get(i + laneStart) || { lane: i + laneStart, empty: true })
  }, [shown, entries, meet, laneStart])

  const racing = runIdx >= 0 ? order[runIdx] : null
  const shownIdx = shown ? order.findIndex((h) => h.id === shown.id) : -1
  const nextToCall = order.slice(shownIdx + 1).find((h) => h.call_stage === 0)
  const stage = shown?.call_stage || 0
  const stageLabel = ['Upcoming', '1st call', '2nd call', 'Final call'][stage] || ''
  const stageBg = stage === 3 ? '#b4461a' : stage === 0 ? '#4a4f6e' : '#1f23c9'

  return (
    <div className="board">
      <div className="board-head">
        <img src={logoH} alt="Vortex Swimming Club" />
        <div style={{ textAlign: 'right' }}>
          <div className="eyebrow" style={{ fontSize: 'clamp(14px, 1.3vw, 22px)' }}>Call room</div>
          <div className="muted" style={{ fontSize: 'clamp(13px, 1.1vw, 20px)', fontWeight: 600 }}>{meet?.name}</div>
        </div>
      </div>

      {loading ? <div className="empty">Loading…</div> : !shown ? (
        <div className="empty" style={{ flex: 1, fontSize: 28 }}>No heats waiting to be called.</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', borderBottom: '2px solid var(--line)', paddingBottom: '1.6vw' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="board-title">Event {shown.event_no} · Heat {shown.heat_no}</div>
              <div className="board-sub">{shown.event_name} · Heat {shown.heat_no} of {shown.heat_total}</div>
            </div>
            <div className="board-stage" style={{ background: stageBg }}>{stageLabel.toUpperCase()}</div>
          </div>

          <div className="board-lanes" style={{ '--rows': Math.ceil(lanes.length / 2) }}>
            {lanes.map((l) => (
              <div key={l.lane} className="board-lane" style={{ opacity: l.empty || l.scratched ? 0.45 : 1 }}>
                <span className="lane">{l.lane}</span>
                <span style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{l.empty ? '—' : l.swimmer_name}</span>
                <span className="muted" style={{ fontSize: '0.75em' }}>{l.empty ? '' : l.scratched ? 'Scratched' : l.club}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {meet?.sponsor_banner && <img className="sponsors" src={meet.sponsor_banner} alt="Meet sponsors" style={{ maxHeight: '9vh', maxWidth: '100%', objectFit: 'contain', alignSelf: 'center' }} />}

      <div className="board-foot">
        <span><strong>Now racing:</strong> {racing ? `Event ${racing.event_no} · Heat ${racing.heat_no} — ${racing.event_name}` : 'Not started'}</span>
        <span><strong>Next to call:</strong> {nextToCall ? `Event ${nextToCall.event_no} · Heat ${nextToCall.heat_no}` : '—'}</span>
      </div>
    </div>
  )
}
