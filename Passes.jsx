import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { Avatar, processPhoto, uploadPhoto } from './photos.jsx'
import { PASS, PASS_TYPES, passForPosition, readPassImage, readPassPdf, removeDesign, saveDesign } from './passes.js'

// Accreditation passes: the marketing artwork per category, who holds which pass,
// and printing (4 per A4, optional back sides for double-sided printing).
export default function Passes({ data, people, passDesigns }) {
  const { apps, positions, meet } = data
  const { urls } = people
  const { designs, reload: reloadDesigns } = passDesigns
  const [holders, setHolders] = useState([])
  const [cat, setCat] = useState('coach')
  const [blank, setBlank] = useState({ vip: 0, vvip: 0 })
  const [backs, setBacks] = useState(true)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [holderUrls, setHolderUrls] = useState({})

  const loadHolders = useCallback(async () => {
    if (!meet) return
    const { data: h } = await supabase.from('vc_pass_holders').select('*').eq('meet_id', meet.id).order('full_name')
    setHolders(h || [])
    const paths = (h || []).map((x) => x.photo_path).filter(Boolean)
    if (paths.length) {
      const { data: s } = await supabase.storage.from('vc-photos').createSignedUrls(paths, 60 * 60 * 6)
      setHolderUrls(Object.fromEntries((s || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])))
    }
  }, [meet])
  useEffect(() => { loadHolders() }, [loadHolders])

  const posByName = useMemo(() => Object.fromEntries(positions.map((p) => [p.name, p])), [positions])
  // Everyone who gets a pass, by category: approved staff (by position) + people added here.
  const byCat = useMemo(() => {
    const m = Object.fromEntries(PASS_TYPES.map((t) => [t.id, []]))
    apps.filter((a) => a.status === 'approved').forEach((a) => {
      const kind = passForPosition(posByName[a.position])
      m[kind]?.push({ key: `a-${a.id}`, id: a.id, name: a.full_name, role: a.position, sub: '', photoUrl: urls[a.photo_path] || null, hasPhoto: !!a.photo_path, pass: kind, source: 'staff' })
    })
    holders.forEach((h) => {
      m[h.category]?.push({ key: `h-${h.id}`, id: h.id, name: h.full_name || '', role: h.role || '', sub: h.organization || '', photoUrl: holderUrls[h.photo_path] || null, hasPhoto: !!h.photo_path, pass: h.category, source: 'added', raw: h })
    })
    Object.values(m).forEach((l) => l.sort((a, b) => a.name.localeCompare(b.name)))
    return m
  }, [apps, holders, posByName, urls, holderUrls])

  async function print(kinds) {
    // Never fall back to the plain badge for these passes: the marketing artwork is required.
    const missing = kinds.filter((k) => k !== 'swimmer' && !designs[k]?.front && (byCat[k].length || blank[k]))
    if (missing.length) {
      setNote(`The ${missing.map((k) => PASS[k].label).join(', ')} pass design is not in the app yet. Click “Upload designs” above, choose the design pictures, then “Save designs” — and print again.`)
      return
    }
    const list = []
    kinds.forEach((k) => {
      list.push(...byCat[k])
      for (let i = 0; i < (blank[k] || 0); i++) list.push({ key: `b-${k}-${i}`, name: '', pass: k })
    })
    if (!list.length) { setNote('Nobody in this category yet.'); return }
    const noArt = [...new Set(list.map((p) => p.pass).filter((k) => !designs[k]?.front))]
    setBusy('print'); setNote('')
    try {
      const { badgesPdf } = await import('./pdfout.js')
      const doc = await badgesPdf({ people: list, meet, designs, backs, onProgress: (n, t) => setNote(`Preparing ${n} / ${t}…`) })
      doc.save(`vic-passes-${kinds.length > 1 ? 'all' : kinds[0]}-${new Date().toISOString().slice(0, 10)}.pdf`)
      setNote(`Passes PDF downloaded: ${list.length} pass${list.length === 1 ? '' : 'es'}, 4 per A4 sheet (A6, cut on the dotted lines)${backs ? ', each front sheet followed by its back sheet for double-sided printing (flip on long edge)' : ''}.${noArt.length ? ` No artwork yet for ${noArt.map((k) => PASS[k].label).join(', ')} — those use the plain Vortex badge.` : ''}`)
    } catch (x) { setNote(`Could not make the passes: ${x.message}`) }
    setBusy('')
  }

  const info = PASS[cat]
  const list = byCat[cat] || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {PASS_TYPES.some((t) => t.id !== 'swimmer' && !designs[t.id]?.front) && (
        <div className="notice error">
          Pass designs missing: {PASS_TYPES.filter((t) => t.id !== 'swimmer' && !designs[t.id]?.front).map((t) => t.label).join(', ')}.
          Upload the design pictures below first — passes without their design cannot be printed.
        </div>
      )}
      <Designs designs={designs} reload={reloadDesigns} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="pills">
            {PASS_TYPES.map((t) => (
              <button key={t.id} className="pill" aria-pressed={cat === t.id} onClick={() => { setCat(t.id); setNote('') }}>
                {t.label} ({byCat[t.id].length + (blank[t.id] || 0)})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={backs} onChange={(e) => setBacks(e.target.checked)} style={{ accentColor: '#1f23c9' }} /> Include back sides
            </label>
            <button className="btn sm" disabled={!!busy} onClick={() => print(PASS_TYPES.map((t) => t.id).filter((k) => k !== 'swimmer'))}>Print all passes</button>
            <button className="btn sm primary" disabled={!!busy} onClick={() => print([cat])}>{busy ? 'Building…' : `Print ${info.label} passes (${list.length + (blank[cat] || 0)})`}</button>
          </div>
        </div>
        <div className="small muted">
          {info.photo ? 'This pass shows the holder’s photo, name and role.' : 'This pass has no photo.'}
          {!designs[cat]?.front && ' No artwork uploaded for this pass yet — upload the design PDF above.'}
          {cat === 'swimmer' && ' Swimmers with photos are managed in the Swimmers and Clubs views; this pass is printed from there once the artwork is uploaded.'}
        </div>
        {note && <div className="notice">{note}</div>}

        {(cat === 'vip' || cat === 'vvip') && (
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Extra blank {info.label} passes (no name):
            <input className="input num" type="number" min="0" max="200" value={blank[cat] || 0} onChange={(e) => setBlank((b) => ({ ...b, [cat]: Math.max(0, Math.min(200, +e.target.value || 0)) }))} style={{ width: 90, minHeight: 34 }} />
          </label>
        )}

        {cat !== 'swimmer' && <AddHolder cat={cat} meet={meet} onAdded={loadHolders} />}

        {cat === 'organizer' || cat === 'officials' ? <PositionMap positions={positions} data={data} /> : null}

        {!list.length ? <div className="empty">No {info.label.toLowerCase()} yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {list.map((p) => <HolderCard key={p.key} p={p} showPhoto={info.photo} onChange={loadHolders} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// Upload the marketing PDFs; each page is recognised by the words on it.
function Designs({ designs, reload }) {
  const [pages, setPages] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  async function pick(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setMsg('Reading the design files…')
    try {
      const all = []
      for (const f of files) all.push(...(/pdf$/i.test(f.name) || f.type === 'application/pdf' ? await readPassPdf(f) : [await readPassImage(f)]))
      setPages(all); setMsg('')
    } catch (x) { setMsg(`Could not read the PDF: ${x.message}`) }
    setBusy(false)
  }
  function setKind(i, kind) { setPages((ps) => ps.map((p, j) => (j === i ? { ...p, kind } : p))) }

  async function save() {
    setBusy(true); setMsg('Saving designs…')
    try {
      let n = 0
      for (const p of pages) {
        if (p.kind && p.kind !== 'back') { await saveDesign(p.kind, 'front', p.blob); n++ }
        if (p.kind === 'back') for (const k of p.backFor || []) { await saveDesign(k, 'back', p.blob); n++ }
      }
      setPages(null); setMsg(`Saved ${n} design side${n === 1 ? '' : 's'}.`); reload()
    } catch (x) { setMsg(x.message) }
    setBusy(false)
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'none', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: 'var(--navy)' }}>Pass designs</div>
          <div className="small muted">Upload the pass design pictures (coach-front.jpg, coach-back.jpg, vip-front.jpg …) — select them all at once. They are sorted into categories by file name. PDFs also work, but some browsers (Safari) draw them wrongly, so pictures are safer.</div>
        </div>
        <button className="btn sm dark" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Working…' : 'Upload designs'}</button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={pick} style={{ display: 'none' }} />
      </div>
      {msg && <div className="notice">{msg}</div>}

      {pages ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {pages.map((p, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <img src={p.preview} alt={`Page ${p.page}`} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
                <select className="input" style={{ minHeight: 32, fontSize: 12.5 }} value={p.kind || ''} onChange={(e) => setKind(i, e.target.value || null)} aria-label={`Category for page ${p.page}`}>
                  <option value="">Skip this page</option>
                  {PASS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — front</option>)}
                  <option value="back">Back side</option>
                </select>
                {p.kind === 'back' && <span className="small muted">Back of: {(p.backFor || []).map((k) => PASS[k].label).join(', ') || '—'}</span>}
              </div>
            ))}
          </div>
          <div className="actions"><button className="btn sm primary" disabled={busy} onClick={save}>Save designs</button><button className="btn sm" onClick={() => setPages(null)}>Cancel</button></div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {PASS_TYPES.map((t) => (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {designs[t.id]?.front
                ? <img src={designs[t.id].front} alt={`${t.label} pass`} style={{ width: '100%', aspectRatio: '105 / 148.5', objectFit: 'cover', borderRadius: 8 }} />
                : <div style={{ width: '100%', aspectRatio: '105 / 148.5', borderRadius: 8, border: '2px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }} className="small muted">{t.id === 'swimmer' ? 'Coming from marketing' : 'No design yet'}</div>}
              <div className="small" style={{ fontWeight: 800 }}>{t.label}</div>
              <div className="small muted">{t.photo ? 'With photo' : 'No photo'}{designs[t.id]?.back ? ' · back ✓' : ''}</div>
              {designs[t.id]?.front && <button className="btn sm" style={{ minHeight: 28, fontSize: 11.5 }} onClick={async () => { if (window.confirm(`Remove the ${t.label} design?`)) { await removeDesign(t.id); reload() } }}>Remove</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Which staff position prints which pass.
function PositionMap({ positions, data }) {
  async function change(p, v) {
    data.setPositions((ps) => ps.map((x) => (x.id === p.id ? { ...x, pass_type: v } : x)))
    await supabase.from('vc_positions').update({ pass_type: v }).eq('id', p.id)
  }
  return (
    <details className="small">
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Which staff position gets which pass</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginTop: 10 }}>
        {positions.map((p) => (
          <label key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <span>{p.name} <span className="muted">· {p.group_name}</span></span>
            <select className="input" style={{ width: 'auto', minHeight: 30, fontSize: 12.5 }} value={passForPosition(p)} onChange={(e) => change(p, e.target.value)}>
              {PASS_TYPES.filter((t) => t.id !== 'swimmer').map((t) => <option key={t.id} value={t.id}>{t.one || t.label}</option>)}
            </select>
          </label>
        ))}
      </div>
    </details>
  )
}

function AddHolder({ cat, meet, onAdded }) {
  const info = PASS[cat]
  const [f, setF] = useState({ full_name: '', organization: '', role: '', photo: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const orgLabel = cat === 'coach' ? 'Club' : cat === 'media' ? 'Media outlet' : 'Organization'

  async function pickPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { setF((v) => ({ ...v, photo: null })); const p = await processPhoto(file); setF((v) => ({ ...v, photo: p })) } catch (x) { setErr(x.message) }
  }
  async function add(e) {
    e.preventDefault()
    if (f.full_name.trim().length < 3) return setErr('Enter the full name.')
    setBusy(true); setErr('')
    try {
      const photo_path = f.photo ? await uploadPhoto('holders', f.photo.blob) : null
      const { error } = await supabase.from('vc_pass_holders').insert({ meet_id: meet.id, category: cat, full_name: f.full_name.trim(), organization: f.organization.trim() || null, role: f.role.trim() || null, photo_path })
      if (error) throw new Error(error.message)
      setF({ full_name: '', organization: '', role: '', photo: null }); onAdded()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: 'var(--soft-2)', borderRadius: 12 }}>
      <span className="small" style={{ fontWeight: 800 }}>Add {info.one || info.label}</span>
      <input className="input" style={{ width: 200, minHeight: 36 }} placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} aria-label="Full name" />
      <input className="input" style={{ width: 170, minHeight: 36 }} placeholder={orgLabel} value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} aria-label={orgLabel} />
      <input className="input" style={{ width: 150, minHeight: 36 }} placeholder="Role / title (optional)" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label="Role" />
      {info.photo && (
        <>
          <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>{f.photo ? 'Photo ✓ (change)' : 'Add photo'}</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
        </>
      )}
      <button className="btn sm primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      {err && <span className="err-text">{err}</span>}
    </form>
  )
}

function HolderCard({ p, showPhoto, onChange }) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  async function replace(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file || p.source !== 'added') return
    setBusy(true)
    try {
      const { blob } = await processPhoto(file)
      const path = await uploadPhoto('holders', blob)
      await supabase.from('vc_pass_holders').update({ photo_path: path }).eq('id', p.id)
      if (p.raw?.photo_path) await supabase.storage.from('vc-photos').remove([p.raw.photo_path])
      onChange()
    } catch { /* message shown by the form on next try */ }
    setBusy(false)
  }
  async function remove() {
    if (!window.confirm(`Remove ${p.name}'s pass?`)) return
    await supabase.from('vc_pass_holders').delete().eq('id', p.id)
    if (p.raw?.photo_path) await supabase.storage.from('vc-photos').remove([p.raw.photo_path])
    onChange()
  }
  return (
    <div style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: 10, display: 'flex', gap: 10, alignItems: 'center', background: '#fff' }}>
      {showPhoto && <Avatar src={p.photoUrl} name={p.name} size={40} radius={7} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)' }}>{p.name}</div>
        <div className="small muted">{[p.role, p.sub].filter(Boolean).join(' · ') || '—'}</div>
        <div className="small" style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span className={`chip ${p.source === 'staff' ? 'info' : 'grey'}`}>{p.source === 'staff' ? 'Approved staff' : 'Added here'}</span>
          {showPhoto && !p.hasPhoto && <span className="chip warn">No photo</span>}
        </div>
      </div>
      {p.source === 'added' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {showPhoto && <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? '…' : 'Photo'}</button>}
          <button className="btn sm" onClick={remove}>Remove</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={replace} style={{ display: 'none' }} />
        </div>
      )}
    </div>
  )
}
