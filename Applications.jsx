import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { download, maskQid, toCsv } from './lib.js'
import { Avatar } from './photos.jsx'

const FILTERS = ['all', 'pending', 'approved', 'declined']
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

export default function Applications({ data }) {
  const { apps, positions } = data
  const [filter, setFilter] = useState('pending')
  const [pos, setPos] = useState('')
  const [revealed, setRevealed] = useState({})
  const [copied, setCopied] = useState(false)

  const list = apps.filter((a) => (filter === 'all' || a.status === filter) && (!pos || a.position === pos))
  const regLink = `${window.location.origin}/register`
  const [open, setOpen] = useState(null) // application shown in the profile window
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const group = useMemo(() => Object.fromEntries(positions.map((p) => [p.name, p.group_name])), [positions])

  // Private photo links for the staff list (organizers only).
  const [urls, setUrls] = useState({})
  const paths = useMemo(() => [...new Set(apps.map((a) => a.photo_path).filter(Boolean))].sort().join('|'), [apps])
  useEffect(() => {
    const list = paths ? paths.split('|') : []
    if (!list.length) return
    let stop = false
    ;(async () => {
      const m = {}
      for (let i = 0; i < list.length; i += 100) {
        const { data: d } = await supabase.storage.from('vc-photos').createSignedUrls(list.slice(i, i + 100), 60 * 60 * 6)
        ;(d || []).forEach((x) => { if (x.signedUrl) m[x.path] = x.signedUrl })
      }
      if (!stop) setUrls(m)
    })()
    return () => { stop = true }
  }, [paths])

  // One PDF with a profile page for every person in the current list.
  async function downloadProfiles(people, name) {
    if (!people.length) return
    setBusy('pdf'); setNote('')
    try {
      const { staffProfilesPdf } = await import('./pdfout.js')
      const doc = await staffProfilesPdf({ people: people.map((a) => ({ ...a, group: group[a.position] || '', photoUrl: urls[a.photo_path] || null })), meet: data.meet, onProgress: (n, t) => setNote(`Preparing ${n} / ${t}…`) })
      doc.save(name)
      setNote(`Downloaded ${people.length} ${people.length === 1 ? 'profile' : 'profiles'} in one PDF.`)
    } catch (x) { setNote(`Could not make the PDF: ${x.message}`) }
    setBusy('')
  }
  const listLabel = `${filter === 'all' ? 'all' : filter}${pos ? `-${pos}` : ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  async function setStatus(a, status) {
    data.setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, status } : x)))
    await supabase.from('vc_applications').update({ status }).eq('id', a.id)
  }
  async function changePosition(a, position) {
    data.setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, position } : x)))
    await supabase.from('vc_applications').update({ position }).eq('id', a.id)
  }
  function exportApproved() {
    const rows = [['Full name', 'QID', 'Mobile', 'Email', 'Position', 'Group', 'Bank', 'Account holder', 'IBAN', 'Fawran mobile', 'Registered']]
    apps.filter((a) => a.status === 'approved').forEach((a) => rows.push([a.full_name, a.qid, '+974' + a.mobile, a.email, a.position, group[a.position] || '', a.bank_name, a.account_holder, a.iban || '', a.fawran_mobile ? '+974' + a.fawran_mobile : '', new Date(a.created_at).toLocaleString('en-GB')]))
    download('vortex-competition-approved-staff.csv', toCsv(rows))
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(regLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }} aria-label="Staff applications">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div className="section-head">
          <h2>Staff applications</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>QID is masked — press Show details to reveal it.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn sm dark" onClick={copyLink}>{copied ? 'Link copied' : 'Copy registration link'}</button>
          <a className="btn sm" href="/register" target="_blank" rel="noreferrer">Open form</a>
          <button className="btn sm" onClick={exportApproved}>Export approved (CSV)</button>
          <button className="btn sm primary" disabled={!!busy || !list.length} onClick={() => downloadProfiles(list, `vortex-staff-profiles-${listLabel}.pdf`)}>{busy === 'pdf' ? 'Preparing…' : `Download profiles PDF (${list.length})`}</button>
        </div>
      </div>
      {note && <div className="notice">{note}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div className="pills" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button key={f} className="pill" style={{ minHeight: 38 }} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)} ({f === 'all' ? apps.length : apps.filter((a) => a.status === f).length})
            </button>
          ))}
        </div>
        <select className="input" aria-label="Position filter" style={{ width: 'auto', minHeight: 38 }} value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">All positions</option>
          {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      <div className="table">
        <table style={{ minWidth: 1040 }}>
          <thead>
            <tr><th>Full name</th><th>QID</th><th>Bank / Fawran</th><th>Position</th><th>Status</th><th style={{ textAlign: 'right' }}>Decision</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="empty">No applications here yet. Share the registration link with interested staff.</td></tr>}
            {list.map((a) => {
              const show = revealed[a.id]
              return (
                <tr key={a.id}>
                  <td>
                    <div className="applicant" role="button" tabIndex={0} title="Open profile" style={{ cursor: 'pointer' }}
                      onClick={() => setOpen(a)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(a) }}>
                      {urls[a.photo_path] ? <Avatar src={urls[a.photo_path]} name={a.full_name} size={44} radius={10} /> : <span className="avatar" aria-hidden="true">{initials(a.full_name)}</span>}
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--navy)', textDecoration: 'underline', textDecorationColor: '#c9cdf5', textUnderlineOffset: 3 }}>{a.full_name}</div>
                        <div className="small muted">+974 {a.mobile}{a.email ? ` · ${a.email}` : ''}</div>
                        <div className="small muted">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="num qid">{show ? a.qid : maskQid(a.qid)}</span></td>
                  <td>
                    <div className="small" style={{ fontWeight: 600 }}>{a.bank_name}{a.account_holder ? ` · ${a.account_holder}` : ''}</div>
                    <div className="num small">Fawran: {a.fawran_mobile ? `+974 ${a.fawran_mobile}` : '—'}</div>
                    <button className="link-btn" onClick={() => setRevealed((r) => ({ ...r, [a.id]: !show }))}>{show ? 'Hide details' : 'Show details'}</button>
                  </td>
                  <td>
                    <select className="input" aria-label="Position" style={{ minHeight: 36, minWidth: 170 }} value={a.position} onChange={(e) => changePosition(a, e.target.value)}>
                      {!positions.some((p) => p.name === a.position) && <option value={a.position}>{a.position}</option>}
                      {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </td>
                  <td><span className={`chip status ${a.status === 'approved' ? 'ok' : a.status === 'declined' ? 'declined' : 'warn'}`}>{a.status}</span></td>
                  <td>
                    <div className="actions">
                      <button className="btn sm primary" disabled={a.status === 'approved'} onClick={() => setStatus(a, 'approved')}>Approve</button>
                      <button className="btn sm danger" disabled={a.status === 'declined'} onClick={() => setStatus(a, 'declined')}>Decline</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {open && (() => {
        const a = apps.find((x) => x.id === open.id) || open
        return <Profile a={a} photo={urls[a.photo_path]} group={group[a.position]} busy={busy}
          onClose={() => setOpen(null)} onStatus={(st) => setStatus(a, st)}
          onPdf={() => downloadProfiles([a], `vortex-staff-${a.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)} />
      })()}
    </section>
  )
}

function Profile({ a, photo, group, busy, onClose, onStatus, onPdf }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const rows = [
    ['Position', `${a.position}${group && group !== a.position ? ` · ${group}` : ''}`],
    ['QID', a.qid],
    ['Mobile', `+974 ${a.mobile}`],
    ['Email', a.email || '—'],
    ['Bank', a.bank_name || '—'],
    ['Account holder', a.account_holder || '—'],
    ['IBAN', a.iban || '—'],
    ['Fawran mobile', a.fawran_mobile ? `+974 ${a.fawran_mobile}` : '—'],
    ['Photo & badge consent', a.consent ? 'Yes' : 'No'],
    ['Marketing use', a.marketing_consent ? 'Yes' : 'No'],
    ['Registered', new Date(a.created_at).toLocaleString('en-GB')],
    ...(a.admin_note ? [['Note', a.admin_note]] : []),
  ]
  return (
    <div role="dialog" aria-modal="true" aria-label={`Profile of ${a.full_name}`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,16,64,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: 'min(560px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(11,16,64,0.3)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {photo ? <img src={photo} alt="" style={{ width: 96, height: 128, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />
            : <span className="avatar" style={{ width: 96, height: 128, borderRadius: 12, fontSize: 28 }} aria-hidden="true">{initials(a.full_name)}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--navy)' }}>{a.full_name}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{a.position}</div>
            <span className={`chip status ${a.status === 'approved' ? 'ok' : a.status === 'declined' ? 'declined' : 'warn'}`} style={{ marginTop: 8, display: 'inline-flex' }}>{a.status}</span>
          </div>
          <button className="btn sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 38%) 1fr', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ display: 'contents' }}>
              <div className="small muted" style={{ padding: '9px 12px', background: i % 2 ? '#fff' : 'var(--soft-2)', fontWeight: 700 }}>{k}</div>
              <div className="small" style={{ padding: '9px 12px', background: i % 2 ? '#fff' : 'var(--soft-2)', wordBreak: 'break-word', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={!!busy} onClick={onPdf}>{busy === 'pdf' ? 'Preparing…' : 'Download profile (PDF)'}</button>
          <button className="btn sm danger" disabled={a.status === 'declined'} onClick={() => onStatus('declined')}>Decline</button>
          <button className="btn sm primary" disabled={a.status === 'approved'} onClick={() => onStatus('approved')}>Approve</button>
        </div>
      </div>
    </div>
  )
}
