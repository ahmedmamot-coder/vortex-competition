import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { BANKS, IBAN_RE, SESSIONS, cleanIban, maskIban, maskQid } from '../lib.js'

const EMPTY = { full_name: '', qid: '', mobile: '', email: '', bank_name: '', account_holder: '', iban: '', position: '', sessions: [], consent: false }

export default function Register() {
  const [meet, setMeet] = useState(null)
  const [positions, setPositions] = useState([])
  const [f, setF] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.from('vc_meet').select('id,name,venue,meet_date').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const m = data?.[0]
        setMeet(m || null)
        if (m) supabase.from('vc_positions').select('name,group_name,sort').eq('meet_id', m.id).order('sort').then(({ data: p }) => setPositions(p || []))
      })
  }, [])

  function validate(v) {
    const e = {}
    if (v.full_name.trim().split(/\s+/).length < 2) e.full_name = 'Enter your full name as on your QID.'
    if (!/^\d{11}$/.test(v.qid)) e.qid = 'QID must be exactly 11 digits.'
    if (!/^\d{8}$/.test(v.mobile)) e.mobile = 'Enter an 8-digit Qatar mobile number.'
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Check the email address.'
    if (!v.bank_name) e.bank_name = 'Choose your bank.'
    if (!IBAN_RE.test(cleanIban(v.iban))) e.iban = `Qatar IBANs start with QA and have 29 characters (${cleanIban(v.iban).length} entered).`
    if (!v.position) e.position = 'Choose one position.'
    if (!v.consent) e.consent = 'Please confirm to continue.'
    return e
  }
  function set(k, val) {
    const next = { ...f, [k]: val }
    setF(next)
    if (tried) setErrors(validate(next))
  }

  async function submit(e) {
    e.preventDefault()
    setTried(true)
    const errs = validate(f)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = document.querySelector('[data-err="true"]')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true); setServerError(null)
    const row = {
      meet_id: meet?.id || null,
      full_name: f.full_name.trim().replace(/\s+/g, ' '),
      qid: f.qid,
      mobile: f.mobile,
      email: f.email.trim() || null,
      bank_name: f.bank_name,
      account_holder: f.account_holder.trim() || null,
      iban: cleanIban(f.iban),
      position: f.position,
      sessions: f.sessions,
      consent: true
    }
    const { error } = await supabase.from('vc_applications').insert(row)
    setBusy(false)
    if (error) setServerError('We could not send your application. Please check your details and try again.')
    else { setDone(row); window.scrollTo({ top: 0 }) }
  }

  const groups = []
  positions.forEach((p) => {
    let g = groups.find((x) => x.name === p.group_name)
    if (!g) { g = { name: p.group_name, items: [] }; groups.push(g) }
    g.items.push(p.name)
  })
  const ib = cleanIban(f.iban)
  const ibanOk = IBAN_RE.test(ib)

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="form-page" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <img src="/logo-horizontal.svg" alt="Vortex Swimming Club" style={{ height: 44, alignSelf: 'flex-start' }} />
        </div>
      </header>

      {done ? (
        <div className="form-page" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 48 }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: '#eef0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1f23c9" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 style={{ fontSize: 26 }}>Application received</h1>
          <p className="muted" style={{ margin: 0 }}>Thank you, {done.full_name}. Your request for <strong style={{ color: 'var(--navy)' }}>{done.position}</strong> is with the meet organizers. We will contact you on +974 {done.mobile} once it is approved.</p>
          <div className="card" style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <Row k="QID" v={maskQid(done.qid)} />
            <Row k="Bank" v={done.bank_name} />
            <Row k="IBAN" v={maskIban(done.iban)} />
          </div>
          <button className="btn" onClick={() => { setDone(null); setF(EMPTY); setTried(false); setErrors({}) }}>Register another person</button>
        </div>
      ) : (
        <form className="form-page" onSubmit={submit} noValidate>
          <div>
            <div className="eyebrow blue">Join the meet crew</div>
            <h1 style={{ fontSize: 28, margin: '4px 0 6px' }}>Staff registration</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {meet ? `${meet.name}${meet.venue ? ' · ' + meet.venue : ''}${meet.meet_date ? ' · ' + meet.meet_date : ''}. ` : ''}
              Fill in your details and choose the position you would like to work.
            </p>
          </div>

          <Field id="fn" label="Full name (as on QID)" err={errors.full_name}>
            <input id="fn" className={`input ${errors.full_name ? 'err' : ''}`} autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="First, middle and last name" />
          </Field>
          <Field id="qid" label="QID number" err={errors.qid}>
            <input id="qid" className={`input num ${errors.qid ? 'err' : ''}`} inputMode="numeric" maxLength={11} value={f.qid} onChange={(e) => set('qid', e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11 digits" />
          </Field>
          <Field id="mob" label="Mobile number" err={errors.mobile}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="input" style={{ width: 'auto', display: 'flex', alignItems: 'center', fontWeight: 700, background: 'var(--soft-2)' }}>+974</span>
              <input id="mob" className={`input ${errors.mobile ? 'err' : ''}`} type="tel" inputMode="numeric" maxLength={8} autoComplete="tel-national" value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digits" />
            </div>
          </Field>
          <Field id="em" label="Email (optional)" err={errors.email}>
            <input id="em" className={`input ${errors.email ? 'err' : ''}`} type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>

          <div className="sep" />
          <div className="eyebrow blue">Payment details</div>

          <Field id="bk" label="Bank" err={errors.bank_name}>
            <select id="bk" className={`input ${errors.bank_name ? 'err' : ''}`} value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)}>
              <option value="">Select your bank</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field id="ah" label="Account holder name">
            <input id="ah" className="input" value={f.account_holder} onChange={(e) => set('account_holder', e.target.value)} placeholder="Must match your full name" />
          </Field>
          <Field id="ib" label="IBAN" err={errors.iban} hint={!errors.iban ? (ibanOk ? 'IBAN format looks correct.' : 'Starts with QA · 29 characters. Find it in your banking app.') : null} hintOk={ibanOk}>
            <input id="ib" className={`input num ${errors.iban ? 'err' : ''}`} autoCapitalize="characters" value={f.iban} onChange={(e) => set('iban', e.target.value.toUpperCase())} placeholder="QA00 XXXX 0000 0000 0000 0000 0000 0" />
          </Field>

          <div className="sep" />
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }} data-err={errors.position ? 'true' : undefined}>
            <legend className="label" style={{ padding: 0, marginBottom: 10 }}>Position you want to work</legend>
            {groups.map((g) => (
              <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="eyebrow" style={{ fontSize: 11.5 }}>{g.name}</div>
                <div className="pills">
                  {g.items.map((n) => <button type="button" key={n} className="pill" aria-pressed={f.position === n} onClick={() => set('position', n)}>{n}</button>)}
                </div>
              </div>
            ))}
            {errors.position && <span className="err-text">{errors.position}</span>}
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ padding: 0, marginBottom: 10 }}>Sessions you are available</legend>
            <div className="sessions">
              {SESSIONS.map((s) => {
                const on = f.sessions.includes(s.id)
                return (
                  <button type="button" key={s.id} className="session" aria-pressed={on} onClick={() => set('sessions', on ? f.sessions.filter((x) => x !== s.id) : [...f.sessions, s.id])}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{s.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>{s.time}</div>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }} data-err={errors.consent ? 'true' : undefined}>
            <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} style={{ width: 20, height: 20, margin: '1px 0 0', accentColor: '#1f23c9', flex: 'none' }} />
            <span>I confirm my details are correct and agree that Vortex Aquatics uses my QID and bank details only for accreditation and staff payment for this meet.</span>
          </label>
          {errors.consent && <span className="err-text" style={{ marginTop: -10 }}>{errors.consent}</span>}

          {serverError && <div className="notice error">{serverError}</div>}
          <button className="btn primary" style={{ minHeight: 54, fontSize: 16 }} disabled={busy}>{busy ? 'Sending…' : 'Submit application'}</button>
          <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Questions? <a href="mailto:aquaticmanager@vortexaquatics.com">aquaticmanager@vortexaquatics.com</a></p>
        </form>
      )}
    </div>
  )
}

function Field({ id, label, err, hint, hintOk, children }) {
  return (
    <div className="field" data-err={err ? 'true' : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {err && <span className="err-text">{err}</span>}
      {!err && hint && <span className="small" style={{ color: hintOk ? 'var(--ok)' : 'var(--muted)' }}>{hint}</span>}
    </div>
  )
}

function Row({ k, v }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{k}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
}
