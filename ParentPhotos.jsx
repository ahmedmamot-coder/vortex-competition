import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'

// Vortex Swimming Club only: a private link for parents to send swimmer photos to the
// Media Team. Photos go to their own private folder (vx-parent-photos) and are NOT
// linked to the competition's swimmer photos.
const FN = 'https://qhrpwiakobgcxfmcoyfg.supabase.co/functions/v1/vx-upload'
const SQUADS = ['Pre Team', 'ADV A', 'ADV B', 'JNR', 'SNR A', 'SNR B', 'VTX A', 'VTX B']
const MAX = 3

async function call(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.')
  return j
}

export default function ParentPhotos() {
  const { token } = useParams()
  const [state, setState] = useState('checking') // checking | ok | closed | sent
  const [f, setF] = useState({ swimmer_name: '', squad: '', parent_name: '', parent_mobile: '', consent: false })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const set = (k, v) => { setErr(''); setF((x) => ({ ...x, [k]: v })) }

  useEffect(() => { call({ action: 'check', token }).then(() => setState('ok'), () => setState('closed')) }, [token])
  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.url)), [files])

  function pick(e) {
    const list = [...(e.target.files || [])].filter((x) => /^image\//.test(x.type) || /\.(heic|heif)$/i.test(x.name))
    e.target.value = ''
    if (!list.length) return setErr('Please choose a photo (JPG, PNG or HEIC).')
    const big = list.find((x) => x.size > 25 * 1024 * 1024)
    if (big) return setErr('Each photo must be under 25 MB.')
    setErr('')
    setFiles((cur) => [...cur, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX))
  }

  async function submit(e) {
    e.preventDefault()
    if (f.swimmer_name.trim().length < 2) return setErr('Please enter the swimmer’s full name.')
    if (!files.length) return setErr('Please add at least one photo.')
    if (!f.consent) return setErr('Please tick the consent box.')
    setErr('')
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading photo ${i + 1} of ${files.length}…`)
        const file = files[i].file
        const ext = (file.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg')
        const s = await call({ action: 'sign', token, ext: /^(jpg|png|heic|heif|webp)$/.test(ext) ? ext : 'jpg' })
        const { error } = await supabase.storage.from('vx-parent-photos').uploadToSignedUrl(s.path, s.upload, file, { contentType: file.type || 'image/jpeg' })
        if (error) throw new Error('The photo could not be uploaded. Please check your connection and try again.')
        await call({ action: 'save', token, path: s.path, ...f })
      }
      setState('sent')
    } catch (x) { setErr(x.message) } finally { setBusy('') }
  }

  function another() {
    setF((x) => ({ ...x, swimmer_name: '', squad: x.squad, consent: false }))
    setFiles([]); setState('ok')
  }

  return (
    <div className="vx-page">
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-page" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <img src={logoH} alt="Vortex International Championships 2026" style={{ height: 60, alignSelf: 'flex-start' }} />
        </div>
      </header>
      <div className="form-page">
        <div>
          <div className="eyebrow blue">Vortex Swimming Club · Media Team</div>
          <h1 style={{ fontSize: 28, margin: '4px 0 6px' }}>Swimmer photo upload</h1>
        </div>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>Dear Parents,</p>
          <p style={{ margin: 0 }}>We are delighted to welcome your club to the Vortex International Championship 26 | Short Course.</p>
          <p style={{ margin: 0 }}>Ahead of the championship, our Media Team is preparing a special “Meet the Teams” series for Vortex Aquatics’ social media platforms. We’d love to introduce your club and swimmers to our community.</p>
          <h2 style={{ fontSize: 18, margin: '8px 0 0' }}>1. Swimmer Details and Photos</h2>
          <div role="note" style={{ margin: '6px 0 2px', padding: '14px 16px', borderRadius: 12, background: '#FFF4CC', border: '2px solid #F5B400', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#5C3B00', textTransform: 'uppercase', letterSpacing: 0.3 }}>Vortex uniform is a must</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#5C3B00' }}>The swimmer must be wearing the Vortex club uniform in the photo. Photos without the Vortex uniform will not be accepted.</div>
            </div>
          </div>
          <h3 style={{ fontSize: 15, margin: '4px 0 0' }}>Photo requirements</h3>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>A recent, passport-style portrait showing the swimmer’s head and shoulders, facing the camera.</li>
            <li>Portrait orientation, with the face centred and fully visible.</li>
            <li>A plain background, even lighting, and a sharp, high-resolution image.</li>
            <li>Please upload the original photo. Swimmers should remove caps, goggles, and sunglasses for the photo. Avoid filters.</li>
          </ul>
        </section>

        {state === 'checking' && <div className="notice">Opening…</div>}
        {state === 'closed' && <div className="notice error">This upload link is not valid or uploads are closed. Please contact the club.</div>}
        {state === 'sent' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="notice">Thank you! The photo for <b>{f.swimmer_name}</b> has been received by the Vortex Media Team.</div>
            <button className="btn primary" onClick={another}>Upload for another swimmer</button>
          </div>
        )}

        {state === 'ok' && (
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label htmlFor="sn">Swimmer full name</label><input id="sn" className="input" value={f.swimmer_name} onChange={(e) => set('swimmer_name', e.target.value)} placeholder="First and last name" /></div>
            <div className="field">
              <label htmlFor="sq">Squad (optional)</label>
              <select id="sq" className="input" value={f.squad} onChange={(e) => set('squad', e.target.value)}>
                <option value="">Choose…</option>
                {SQUADS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="pn">Parent name (optional)</label><input id="pn" className="input" autoComplete="name" value={f.parent_name} onChange={(e) => set('parent_name', e.target.value)} /></div>
            <div className="field"><label htmlFor="pm">Parent mobile (optional)</label><input id="pm" className="input" type="tel" inputMode="tel" value={f.parent_mobile} onChange={(e) => set('parent_mobile', e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20))} /></div>

            <div className="field">
              <label>Photo{MAX > 1 ? ` (up to ${MAX})` : ''}</label>
              {files.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {files.map((x, i) => (
                    <div key={x.url} style={{ position: 'relative' }}>
                      <img src={x.url} alt="" style={{ width: 96, height: 128, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--soft-2)' }} />
                      <button type="button" className="btn sm" aria-label="Remove photo" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, padding: '2px 8px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {files.length < MAX && (
                <label className="btn" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
                  {files.length ? 'Add another photo' : 'Choose photo'}
                  <input type="file" accept="image/*,.heic,.heif" multiple onChange={pick} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
              <span className="small">I am the swimmer’s parent or guardian and I agree that Vortex Aquatics may use this photo in its “Meet the Teams” series on its social media platforms.</span>
            </label>

            {err && <div className="notice error">{err}</div>}
            <button className="btn primary" style={{ minHeight: 52 }} disabled={!!busy}>{busy || 'Send photo'}</button>
          </form>
        )}
        <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Questions? <a href="mailto:aquaticmanager@vortexaquatics.com">aquaticmanager@vortexaquatics.com</a></p>
      </div>
    </div>
  )
}
