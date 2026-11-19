import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Organizers: photos sent by Vortex Swimming Club parents through the private link.
// Kept in their own private folder; never linked to the competition photos.
// Downloads are the ORIGINAL files exactly as uploaded (full quality, no compression).
const BUCKET = 'vx-parent-photos'
const safe = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'unnamed'
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '')

let jszip
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip)
  return (jszip = jszip || new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    s.onload = () => ok(window.JSZip)
    s.onerror = () => { jszip = null; fail(new Error('Could not load the ZIP tool. Check the internet connection.')) }
    document.head.appendChild(s)
  }))
}

export default function VortexPhotos() {
  const [cfg, setCfg] = useState(null)
  const [rows, setRows] = useState(null)
  const [thumbs, setThumbs] = useState({})
  const [sizes, setSizes] = useState({})
  const [q, setQ] = useState('')
  const [squad, setSquad] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  async function load() {
    const [{ data: c }, { data: r, error }] = await Promise.all([
      supabase.from('vx_upload_config').select('token, open').eq('id', 1).maybeSingle(),
      supabase.from('vx_photo_uploads').select('*').order('created_at', { ascending: false }),
    ])
    if (error) { setMsg(error.message); return }
    setCfg(c); setRows(r || [])
    const paths = (r || []).map((x) => x.path)
    const t = {}
    for (let i = 0; i < paths.length; i += 100) {
      // Small previews only; downloads always use the original file.
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600)
      ;(data || []).forEach((d) => { if (d.signedUrl) t[d.path] = d.signedUrl })
    }
    setThumbs(t)
    const days = [...new Set(paths.map((p) => p.split('/')[0]))]
    const s = {}
    for (const d of days) {
      const { data } = await supabase.storage.from(BUCKET).list(d, { limit: 1000 })
      ;(data || []).forEach((o) => { s[`${d}/${o.name}`] = o.metadata?.size })
    }
    setSizes(s)
  }
  useEffect(() => { load() }, [])

  const link = cfg ? `${window.location.origin}/vortex-photos/${cfg.token}` : ''
  const shown = (rows || []).filter((r) => (!squad || r.squad === squad) && (!q || `${r.swimmer_name} ${r.parent_name || ''}`.toLowerCase().includes(q.toLowerCase())))

  async function copy() { try { await navigator.clipboard.writeText(link); setMsg('Link copied.') } catch { setMsg(link) } }
  async function toggle() {
    const { error } = await supabase.from('vx_upload_config').update({ open: !cfg.open }).eq('id', 1)
    if (error) setMsg(error.message); else setCfg({ ...cfg, open: !cfg.open })
  }
  async function newLink() {
    if (!window.confirm('Make a new link? The old link will stop working for parents.')) return
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
    const { error } = await supabase.from('vx_upload_config').update({ token }).eq('id', 1)
    if (error) setMsg(error.message); else setCfg({ ...cfg, token })
  }

  async function original(r) {
    const { data, error } = await supabase.storage.from(BUCKET).download(r.path)
    if (error || !data) throw new Error('Could not download ' + r.swimmer_name)
    return data
  }
  const fileName = (r, used) => {
    const ext = r.path.split('.').pop()
    let base = safe(`${r.swimmer_name}${r.squad ? ' - ' + r.squad : ''}`), n = 2
    while (used.has(base)) base = safe(`${r.swimmer_name}${r.squad ? ' - ' + r.squad : ''}`) + ` (${n++})`
    used.add(base)
    return `${base}.${ext}`
  }

  async function downloadOne(r) {
    try {
      const blob = await original(r)
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName(r, new Set()); a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (x) { setMsg(x.message) }
  }

  async function downloadAll() {
    if (!shown.length) return
    setMsg('')
    try {
      const JSZip = await loadJSZip()
      const zip = new JSZip()
      const used = new Set()
      const list = [['Swimmer', 'Squad', 'Parent', 'Mobile', 'Uploaded', 'File'].map(csv).join(',')]
      const jobs = shown.map((r) => ({ r, file: fileName(r, used) }))
      jobs.forEach(({ r, file }) => list.push([r.swimmer_name, r.squad, r.parent_name, r.parent_mobile, new Date(r.created_at).toLocaleString(), file].map(csv).join(',')))
      let done = 0, failed = 0
      const queue = [...jobs]
      const worker = async () => {
        while (queue.length) {
          const j = queue.shift()
          try { zip.file(j.file, await (await original(j.r)).arrayBuffer(), { binary: true }) } catch { failed++ }
          setBusy(`Downloading ${++done} of ${jobs.length}…`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker))
      zip.file('index.csv', '﻿' + list.join('\r\n'))
      setBusy('Making the ZIP…')
      // STORE = no recompression: every photo is the original file, byte for byte.
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `Vortex parent photos ${new Date().toISOString().slice(0, 10)}.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      setMsg(failed ? `${failed} photo(s) could not be downloaded.` : `${jobs.length} original photos downloaded.`)
    } catch (x) { setMsg(x.message) } finally { setBusy('') }
  }

  async function remove(r) {
    if (!window.confirm(`Delete the photo for ${r.swimmer_name}? This cannot be undone.`)) return
    const { error: e1 } = await supabase.storage.from(BUCKET).remove([r.path])
    const { error: e2 } = await supabase.from('vx_photo_uploads').delete().eq('id', r.id)
    if (e1 || e2) setMsg((e1 || e2).message); else setRows((x) => x.filter((y) => y.id !== r.id))
  }

  const squads = [...new Set((rows || []).map((r) => r.squad).filter(Boolean))].sort()

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow blue">Vortex Swimming Club only</div>
        <h2 style={{ margin: 0 }}>Parent photo upload link</h2>
        <p className="small muted" style={{ margin: 0 }}>Share this private link with Vortex parents. Photos are saved in their own folder and are not added to the competition photos or the VIC site. Downloads are the original files at full quality.</p>
        {cfg && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="input" readOnly value={link} style={{ flex: '1 1 320px' }} onFocus={(e) => e.target.select()} />
              <button className="btn sm primary" onClick={copy}>Copy link</button>
              <a className="btn sm" href={link} target="_blank" rel="noreferrer">Open</a>
              <button className="btn sm" onClick={toggle}>{cfg.open ? 'Close uploads' : 'Reopen uploads'}</button>
              <button className="btn sm" onClick={newLink}>New link</button>
            </div>
            <span className="small" style={{ color: cfg.open ? 'var(--ok, #0a7d3b)' : '#b42318', fontWeight: 700 }}>{cfg.open ? 'Uploads are open' : 'Uploads are closed'}</span>
          </>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={{ margin: 0, flex: '1 1 auto' }}>Photos received ({rows ? rows.length : '…'})</h3>
          <input className="input" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
          <select className="input" value={squad} onChange={(e) => setSquad(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All squads</option>
            {squads.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn sm" onClick={load}>Refresh</button>
          <button className="btn sm primary" onClick={downloadAll} disabled={!!busy || !shown.length}>{busy || `Download all originals (${shown.length})`}</button>
        </div>
        {msg && <div className="notice">{msg}</div>}
        {rows && !rows.length && <p className="muted small" style={{ margin: 0 }}>No photos yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {shown.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ aspectRatio: '3 / 4', background: 'var(--soft-2)' }}>
                {thumbs[r.path] && <img src={thumbs[r.path]} alt={r.swimmer_name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: 14 }}>{r.swimmer_name}</b>
                <span className="small muted">{[r.squad, r.parent_name].filter(Boolean).join(' · ') || '—'}</span>
                {r.parent_mobile && <span className="small muted">{r.parent_mobile}</span>}
                <span className="small muted">{new Date(r.created_at).toLocaleDateString()} {mb(sizes[r.path])}</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn sm" onClick={() => downloadOne(r)}>Original</button>
                  <button className="btn sm" onClick={() => remove(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
