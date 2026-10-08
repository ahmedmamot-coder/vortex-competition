import { useState } from 'react'
import logoH from './logo-horizontal.svg'
import { supabase } from './supabase.js'
import { useMeet } from './useMeet.js'
import CallRoom from './CallRoom.jsx'
import Officials from './Officials.jsx'
import Applications from './Applications.jsx'
import Setup from './Setup.jsx'
import { heatCode } from './lib.js'

const TABS = [
  { id: 'call', label: 'Call Room' },
  { id: 'officials', label: 'Officials & Positions' },
  { id: 'staff', label: 'Staff Applications' },
  { id: 'setup', label: 'Meet Setup' }
]

export default function Console() {
  const data = useMeet()
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('vc-tab') || 'call' } catch { return 'call' }
  })
  const pick = (t) => { setTab(t); try { localStorage.setItem('vc-tab', t) } catch { /* ignore */ } }

  const { meet, order, runIdx, positions, apps } = data
  const racing = runIdx >= 0 ? order[runIdx] : null
  const deck = order[runIdx + 1] || null
  const done = runIdx >= 0 ? runIdx : 0
  const approved = apps.filter((a) => a.status === 'approved')
  const required = positions.reduce((s, p) => s + p.required, 0)
  const filled = positions.reduce((s, p) => s + Math.min(p.required, approved.filter((a) => a.position === p.name).length), 0)
  const pending = apps.filter((a) => a.status === 'pending').length

  async function advance() {
    if (!meet || !order.length) return
    const next = order[Math.min(runIdx + 1, order.length - 1)]
    data.setMeet({ ...meet, running_heat_id: next.id })
    await supabase.from('vc_meet').update({ running_heat_id: next.id }).eq('id', meet.id)
  }

  return (
    <div>
      <header className="topbar">
        <div className="wrap">
          <div className="brand">
            <img src={logoH} alt="Vortex Swimming Club" />
            <div className="divider" />
            <div className="meet-txt">
              <div className="meet-name">{meet?.name || 'Vortex Competition'}</div>
              <div className="meet-sub">{[meet?.venue, meet?.meet_date, meet ? `${meet.lanes} lanes` : null].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <nav className="tabs" aria-label="Modules">
              {TABS.map((t) => (
                <button key={t.id} aria-pressed={tab === t.id} onClick={() => pick(t.id)}>
                  {t.label}{t.id === 'staff' && pending > 0 ? ` (${pending})` : ''}
                </button>
              ))}
            </nav>
            <a className="btn sm" href="/board" target="_blank" rel="noreferrer">Call room screen</a>
            <button className="btn sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {data.error && <div className="notice error">{data.error}</div>}

        <section className="grid-kpi" aria-label="Meet summary">
          <div className="card navy" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="eyebrow">Now racing</div>
            <div className="kpi">{racing ? heatCode(racing) : 'Not started'}</div>
            <div className="small" style={{ color: '#d5dbfa' }}>{racing ? racing.event_name : 'Press start when the first heat is on the blocks'}</div>
            <button className="btn sm ghost-light" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={advance} disabled={!order.length || runIdx >= order.length - 1}>
              {runIdx < 0 ? 'Start meet — first heat' : 'Race finished — next heat'}
            </button>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="eyebrow">Behind the blocks</div>
            <div className="kpi">{deck ? heatCode(deck) : '—'}</div>
            <div className="small muted">{deck ? deck.event_name : 'No more heats'}</div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="eyebrow">Meet progress</div>
            <div className="kpi">{done} / {order.length} heats</div>
            <div className="bar"><div style={{ width: `${order.length ? Math.round((done / order.length) * 100) : 0}%` }} /></div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="eyebrow">Staff confirmed</div>
            <div className="kpi">{filled} / {required}</div>
            <div className="small muted">{pending} application{pending === 1 ? '' : 's'} waiting for review</div>
          </div>
        </section>

        {data.loading ? <div className="empty">Loading meet…</div> : (
          <>
            {tab === 'call' && <CallRoom data={data} onGoSetup={() => pick('setup')} />}
            {tab === 'officials' && <Officials data={data} />}
            {tab === 'staff' && <Applications data={data} />}
            {tab === 'setup' && <Setup data={data} />}
          </>
        )}

        {meet?.sponsor_banner && (
          <footer style={{ borderTop: '1px solid var(--line)', paddingTop: 20, display: 'flex', justifyContent: 'center' }}>
            <img src={meet.sponsor_banner} alt="Meet sponsors" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain' }} />
          </footer>
        )}
      </main>
    </div>
  )
}
