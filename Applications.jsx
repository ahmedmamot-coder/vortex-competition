import { useState } from 'react'
import { supabase } from './supabase.js'
import { SESSIONS, download, fmtIban, maskIban, maskQid, toCsv } from './lib.js'

const FILTERS = ['all', 'pending', 'approved', 'declined']

export default function Applications({ data }) {
  const { apps, positions } = data
  const [filter, setFilter] = useState('pending')
  const [pos, setPos] = useState('')
  const [revealed, setRevealed] = useState({})
  const [copied, setCopied] = useState(false)

  const list = apps.filter((a) => (filter === 'all' || a.status === filter) && (!pos || a.position === pos))
  const regLink = `${window.location.origin}/register`
  const sessionName = (id) => SESSIONS.find((s) => s.id === id)?.name || id

  async function setStatus(a, status) {
    data.setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, status } : x)))
    await supabase.from('vc_applications').update({ status }).eq('id', a.id)
  }
  async function changePosition(a, position) {
    data.setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, position } : x)))
    await supabase.from('vc_applications').update({ position }).eq('id', a.id)
  }
  function exportApproved() {
    const rows = [['Full name', 'QID', 'Mobile', 'Email', 'Position', 'Bank', 'Account holder', 'IBAN', 'Sessions']]
    apps.filter((a) => a.status === 'approved').forEach((a) => rows.push([a.full_name, a.qid, '+974' + a.mobile, a.email, a.position, a.bank_name, a.account_holder, a.iban, (a.sessions || []).map(sessionName).join(' / ')]))
    download('vortex-competition-approved-staff.csv', toCsv(rows))
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(regLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }} aria-label="Staff applications">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24 }}>Staff applications</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>QID and IBAN are masked — press Show to see the full details.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn sm dark" onClick={copyLink}>{copied ? 'Link copied' : 'Copy registration link'}</button>
          <a className="btn sm" href="/register" target="_blank" rel="noreferrer">Open form</a>
          <button className="btn sm" onClick={exportApproved}>Export approved (CSV)</button>
        </div>
      </div>

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
            <tr><th>Full name</th><th>QID</th><th>Bank / IBAN</th><th>Position</th><th>Sessions</th><th>Status</th><th style={{ textAlign: 'right' }}>Decision</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="empty">No applications here yet. Share the registration link with interested staff.</td></tr>}
            {list.map((a) => {
              const show = revealed[a.id]
              return (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{a.full_name}</div>
                    <div className="small muted">+974 {a.mobile}{a.email ? ` · ${a.email}` : ''}</div>
                    <div className="small muted">{new Date(a.created_at).toLocaleString()}</div>
                  </td>
                  <td className="num">{show ? a.qid : maskQid(a.qid)}</td>
                  <td>
                    <div className="small" style={{ fontWeight: 600 }}>{a.bank_name}{a.account_holder ? ` · ${a.account_holder}` : ''}</div>
                    <div className="num small">{show ? fmtIban(a.iban) : maskIban(a.iban)}</div>
                    <button className="btn sm" style={{ minHeight: 28, marginTop: 4 }} onClick={() => setRevealed((r) => ({ ...r, [a.id]: !show }))}>{show ? 'Hide' : 'Show'}</button>
                  </td>
                  <td>
                    <select className="input" aria-label="Position" style={{ minHeight: 36, minWidth: 170 }} value={a.position} onChange={(e) => changePosition(a, e.target.value)}>
                      {!positions.some((p) => p.name === a.position) && <option value={a.position}>{a.position}</option>}
                      {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="small">{(a.sessions || []).map(sessionName).join(', ') || '—'}</td>
                  <td><span className={`chip ${a.status === 'approved' ? 'ok' : a.status === 'declined' ? 'grey' : 'warn'}`}>{a.status}</span></td>
                  <td>
                    <div className="actions">
                      <button className="btn sm primary" disabled={a.status === 'approved'} onClick={() => setStatus(a, 'approved')}>Approve</button>
                      <button className="btn sm" disabled={a.status === 'declined'} onClick={() => setStatus(a, 'declined')}>Decline</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
