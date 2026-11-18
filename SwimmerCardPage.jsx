import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'

// Public page opened from the QR code on a swimmer's pass: the swimmer's events,
// heats and lanes from this system, and a link to their results on the VIC results site.
// No photo and no contact details are shown here.
const pretty = (n) => (n && n.includes(',') ? `${n.split(',').slice(1).join(',').trim()} ${n.split(',')[0].trim()}` : n || '')

export default function SwimmerCardPage() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { setStatus('missing'); return }
    supabase.rpc('vc_swimmer_card', { p_id: id }).then(({ data, error }) => {
      if (error) setStatus('error')
      else if (!data) setStatus('missing')
      else { setD(data); setStatus('ok') }
    })
  }, [id])

  const heats = d?.heats || []
  const entries = d?.entries || []
  return (
    <div className="vx-page">
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-page" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <img src={logoH} alt="Vortex International Championships 2026" style={{ height: 54, alignSelf: 'flex-start' }} />
        </div>
      </header>
      <div className="form-page">
        {status === 'loading' && <div className="empty">Loading…</div>}
        {status === 'missing' && <div className="notice">This swimmer is not in the current competition.</div>}
        {status === 'error' && <div className="notice error">Could not load this page. Check the internet connection and try again.</div>}
        {status === 'ok' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {d.logo && <img src={d.logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)', background: '#fff', padding: 4 }} />}
              <div>
                <div className="eyebrow blue">{d.club}</div>
                <h1 style={{ fontSize: 26, margin: '2px 0 4px' }}>{pretty(d.name)}</h1>
                <div className="small muted">{[d.gender === 'F' ? 'Female' : d.gender === 'M' ? 'Male' : null, d.age ? `Age ${d.age}` : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="small muted">{[d.meet?.name, d.meet?.venue, d.meet?.date].filter(Boolean).join(' · ')}</div>

            {d.results_url && <a className="btn primary" style={{ minHeight: 52, justifyContent: 'center' }} href={d.results_url}>Results and live times</a>}

            <div>
              <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>{heats.length ? 'Races, heats and lanes' : 'Entered events'}</div>
              {heats.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heats.map((h, i) => (
                    <div key={i} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, opacity: h.scratched ? 0.5 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>Event {h.event_no} · {h.event}</div>
                        <div className="small muted">Heat {h.heat} of {h.heats}{h.seed ? ` · Entry time ${h.seed}` : ''}{h.scratched ? ' · Withdrawn' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 54 }}>
                        <div className="small muted">Lane</div>
                        <div style={{ fontWeight: 900, fontSize: 24, color: 'var(--navy)' }}>{h.lane}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : entries.length ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {entries.map((e, i) => (
                      <div key={i} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontWeight: 800 }}>Event {e.code || e.no} · {e.name}</div>
                        {e.seed && <div className="small muted">Entry time {e.seed}</div>}
                      </div>
                    ))}
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>Heats and lanes appear here when the heat sheet is published.</p>
                </>
              ) : <div className="small muted">Events appear here when the heat sheet is published.</div>}
            </div>
          </>
        )}
      </div>
      {d?.meet?.sponsor_banner && (
        <footer style={{ borderTop: '1px solid var(--line)', padding: 20, display: 'flex', justifyContent: 'center' }}>
          <img src={d.meet.sponsor_banner} alt="Meet sponsors" style={{ maxWidth: 'min(100%, 720px)', maxHeight: 80, objectFit: 'contain' }} />
        </footer>
      )}
    </div>
  )
}
