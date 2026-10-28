import { useEffect, useState } from 'react'
import logoH from './logo-horizontal.svg'
import { supabase } from './supabase.js'
import { PhotoPicker, uploadPhoto } from './photos.jsx'

const EMPTY = { full_name: '', club: '', birth_year: '', guardian_name: '', guardian_mobile: '', photo: null, consent: false, marketing: false }
const THIS_YEAR = new Date().getFullYear()

// Public page: a parent or guardian registers a swimmer's name and photo for the meet.
export default function SwimmerRegister() {
  const [meet, setMeet] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.from('vc_meet').select('id,name,venue,meet_date,sponsor_banner').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setMeet(data?.[0] || null))
  }, [])

  function validate(v) {
    const e = {}
    if (v.full_name.trim().split(/\s+/).length < 2) e.full_name = 'Enter the swimmer’s first and last name, as on the heat sheet.'
    if (!v.club.trim()) e.club = 'Enter the swimmer’s club.'
    if (v.birth_year && !(+v.birth_year >= THIS_YEAR - 80 && +v.birth_year <= THIS_YEAR - 3)) e.birth_year = 'Check the year of birth.'
    if (!v.photo) e.photo = 'Add a clear photo of the swimmer’s face.'
    if (v.guardian_name.trim().split(/\s+/).length < 2) e.guardian_name = 'Enter the parent or guardian’s full name.'
    if (!/^\d{8}$/.test(v.guardian_mobile)) e.guardian_mobile = 'Enter an 8-digit Qatar mobile number.'
    if (!v.consent) e.consent = 'A parent or guardian must agree to continue.'
    return e
  }
  function set(k, val) {
    setF((prev) => {
      const next = { ...prev, [k]: val }
      if (tried) setErrors(validate(next))
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    setTried(true)
    const errs = validate(f)
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.querySelector('[data-err="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true); setServerError(null)
    let photo_path
    try { photo_path = await uploadPhoto('swimmers', f.photo.blob) } catch (x) { setBusy(false); setServerError(x.message); return }
    const row = {
      meet_id: meet?.id || null,
      full_name: f.full_name.trim().replace(/\s+/g, ' '),
      club: f.club.trim(),
      birth_year: f.birth_year ? +f.birth_year : null,
      guardian_name: f.guardian_name.trim(),
      guardian_mobile: f.guardian_mobile,
      guardian_consent: true,
      marketing_consent: f.marketing,
      photo_path
    }
    const { error } = await supabase.from('vc_swimmers').insert(row)
    setBusy(false)
    if (error) setServerError('We could not save this registration. Please check the details and try again.')
    else { setDone({ ...row, preview: f.photo.preview }); window.scrollTo({ top: 0 }) }
  }

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-page" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <img src={logoH} alt="Vortex Swimming Club" style={{ height: 44, alignSelf: 'flex-start' }} />
        </div>
      </header>

      {done ? (
        <div className="form-page" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 48 }}>
          <img src={done.preview} alt={`Photo of ${done.full_name}`} style={{ width: 120, height: 160, borderRadius: 14, objectFit: 'cover' }} />
          <h1 style={{ fontSize: 26 }}>Swimmer registered</h1>
          <p className="muted" style={{ margin: 0 }}><strong style={{ color: 'var(--navy)' }}>{done.full_name}</strong> ({done.club}) is registered for {meet?.name || 'the meet'}. The photo will be used on the accreditation badge and on the officials’ heat sheets.</p>
          <button className="btn" onClick={() => { setDone(null); setF((p) => ({ ...EMPTY, club: p.club, guardian_name: p.guardian_name, guardian_mobile: p.guardian_mobile })); setTried(false); setErrors({}) }}>Register another swimmer</button>
        </div>
      ) : (
        <form className="form-page" onSubmit={submit} noValidate>
          <div>
            <div className="eyebrow blue">Swimmer accreditation</div>
            <h1 style={{ fontSize: 28, margin: '4px 0 6px' }}>Swimmer registration</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {meet ? `${meet.name}${meet.venue ? ' · ' + meet.venue : ''}${meet.meet_date ? ' · ' + meet.meet_date : ''}. ` : ''}
              To be filled in by a parent or guardian. Use the swimmer’s name exactly as on the heat sheet.
            </p>
          </div>

          <Field id="sn" label="Swimmer full name" err={errors.full_name}>
            <input id="sn" className={`input ${errors.full_name ? 'err' : ''}`} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="First and last name" />
          </Field>
          <PhotoPicker label="Swimmer photo" value={f.photo} onChange={(v) => set('photo', v)} err={errors.photo} hint="Head and shoulders, facing the camera, plain background. No goggles or cap." />
          <Field id="cl" label="Club" err={errors.club}>
            <input id="cl" className={`input ${errors.club ? 'err' : ''}`} value={f.club} onChange={(e) => set('club', e.target.value)} placeholder="e.g. Vortex Aquatics" />
          </Field>
          <Field id="by" label="Year of birth (optional)" err={errors.birth_year}>
            <input id="by" className={`input num ${errors.birth_year ? 'err' : ''}`} inputMode="numeric" maxLength={4} value={f.birth_year} onChange={(e) => set('birth_year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="YYYY" />
          </Field>

          <div className="sep" />
          <div className="eyebrow blue">Parent or guardian</div>
          <Field id="gn" label="Parent / guardian full name" err={errors.guardian_name}>
            <input id="gn" className={`input ${errors.guardian_name ? 'err' : ''}`} autoComplete="name" value={f.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} />
          </Field>
          <Field id="gm" label="Parent / guardian mobile" err={errors.guardian_mobile}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="input" style={{ width: 'auto', display: 'flex', alignItems: 'center', fontWeight: 700, background: 'var(--soft-2)' }}>+974</span>
              <input id="gm" className={`input ${errors.guardian_mobile ? 'err' : ''}`} type="tel" inputMode="numeric" maxLength={8} autoComplete="tel-national" value={f.guardian_mobile} onChange={(e) => set('guardian_mobile', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digits" />
            </div>
          </Field>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }} data-err={errors.consent ? 'true' : undefined}>
            <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} style={{ width: 20, height: 20, margin: '1px 0 0', accentColor: '#1f23c9', flex: 'none' }} />
            <span>I am the swimmer’s parent or guardian and agree that this name and photo are used for the accreditation badge and by meet officials (call room and heat sheets) at this meet.</span>
          </label>
          {errors.consent && <span className="err-text" style={{ marginTop: -10 }}>{errors.consent}</span>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.marketing} onChange={(e) => set('marketing', e.target.checked)} style={{ width: 20, height: 20, margin: '1px 0 0', accentColor: '#1f23c9', flex: 'none' }} />
            <span>Optional: Vortex may use the swimmer’s name and photo in meet promotion and social media.</span>
          </label>

          {serverError && <div className="notice error">{serverError}</div>}
          <button className="btn primary" style={{ minHeight: 54, fontSize: 16 }} disabled={busy}>{busy ? 'Uploading…' : 'Register swimmer'}</button>
          <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Questions? <a href="mailto:aquaticmanager@vortexaquatics.com">aquaticmanager@vortexaquatics.com</a></p>
        </form>
      )}
      {meet?.sponsor_banner && (
        <footer style={{ borderTop: '1px solid var(--line)', padding: '20px', display: 'flex', justifyContent: 'center' }}>
          <img src={meet.sponsor_banner} alt="Meet sponsors" style={{ maxWidth: 'min(100%, 720px)', maxHeight: 90, objectFit: 'contain' }} />
        </footer>
      )}
    </div>
  )
}

function Field({ id, label, err, children }) {
  return (
    <div className="field" data-err={err ? 'true' : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {err && <span className="err-text">{err}</span>}
    </div>
  )
}
