import { useEffect, useState } from 'react'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'

// One link for every club. A new club registers (club name, team code, coach);
// a club that is already registered opens its page again with the coach's mobile.
// Either way the club lands on its own private page to add the logo and swimmers.
export default function ClubsJoin() {
  const [meet, setMeet] = useState(null)
  const [clubs, setClubs] = useState(null)
  const [mode, setMode] = useState('new')
  const [f, setF] = useState({ club_id: '', name: '', code: '', coach: '', mobile: '', email: '' })
  const [login, setLogin] = useState({ club_id: '', mobile: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('vc_meet').select('id,name,venue,meet_date,sponsor_banner').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setMeet(data?.[0] || null))
    supabase.rpc('vc_clubs_public').then(({ data }) => setClubs(data || []))
  }, [])

  const unclaimed = (clubs || []).filter((c) => !c.registered)
  const pickedNew = (clubs || []).find((c) => c.id === login.club_id && !c.registered) || null
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const go = (key) => { window.location.href = `/club?key=${key}` }

  async function signup(e) {
    e.preventDefault()
    setErr('')
    if (!f.club_id && f.name.trim().length < 2) return setErr('Enter your club or academy name.')
    if (f.coach.trim().split(/\s+/).length < 2) return setErr('Enter the coach or team manager’s full name.')
    if (!/^\d{8}$/.test(f.mobile)) return setErr('Enter an 8-digit Qatar mobile number.')
    setBusy(true)
    const { data, error } = await supabase.rpc('vc_club_signup', { p_club_id: f.club_id || null, p_name: f.club_id ? '' : f.name, p_code: f.code, p_coach: f.coach, p_mobile: f.mobile, p_email: f.email })
    setBusy(false)
    if (error) {
      if (/already registered/.test(error.message)) { setMode('back'); setLogin({ club_id: f.club_id, mobile: '' }); return setErr('This club is already registered. Open it with the coach’s mobile number.') }
      if (/already listed/.test(error.message)) return setErr('This club is already in the list. Choose it from “My club is listed”.')
      return setErr('Could not register the club. Please check the details and try again.')
    }
    go(data)
  }

  async function open(e) {
    e.preventDefault()
    setErr('')
    if (!login.club_id) return setErr('Choose your club.')
    if (pickedNew) return setErr(`${pickedNew.name} is not registered yet. Use the button above to register it.`)
    if (!/^\d{8}$/.test(login.mobile)) return setErr('Enter the 8-digit mobile number used to register the club.')
    setBusy(true)
    const { data, error } = await supabase.rpc('vc_club_login', { p_club_id: login.club_id, p_mobile: login.mobile })
    setBusy(false)
    if (error || !data) return setErr('That mobile number does not match this club. Contact the organizers if you need help.')
    go(data)
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
          <div className="eyebrow blue">Clubs and academies</div>
          <h1 style={{ fontSize: 28, margin: '4px 0 6px' }}>Club registration</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {meet ? `${meet.name}${meet.venue ? ' · ' + meet.venue : ''}${meet.meet_date ? ' · ' + meet.meet_date : ''}. ` : ''}
            Register your club once, then add your club logo and each swimmer’s name and photo for accreditation.
          </p>
        </div>

        <div className="pills">
          <button type="button" className="pill" aria-pressed={mode === 'new'} onClick={() => { setMode('new'); setErr('') }}>Register my club</button>
          <button type="button" className="pill" aria-pressed={mode === 'back'} onClick={() => { setMode('back'); setErr('') }}>Already registered</button>
        </div>

        {mode === 'new' ? (
          <form onSubmit={signup} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {unclaimed.length > 0 && (
              <div className="field">
                <label htmlFor="cl">Your club</label>
                <select id="cl" className="input" value={f.club_id} onChange={(e) => set('club_id', e.target.value)}>
                  <option value="">My club is not in this list — add it</option>
                  {unclaimed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {!f.club_id && (
              <>
                <div className="field"><label htmlFor="cn">Club or academy name</label><input id="cn" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="field">
                  <label htmlFor="cc">Team code in HY-TEK (if you know it)</label>
                  <input id="cc" className="input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase().slice(0, 12))} placeholder="e.g. VTX" />
                  <span className="small muted">The short team code used in your HY-TEK entries. Leave empty if you are not sure.</span>
                </div>
              </>
            )}
            <div className="field"><label htmlFor="co">Coach or team manager full name</label><input id="co" className="input" autoComplete="name" value={f.coach} onChange={(e) => set('coach', e.target.value)} /></div>
            <div className="field">
              <label htmlFor="cm">Mobile number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="input" style={{ width: 'auto', display: 'flex', alignItems: 'center', fontWeight: 700, background: 'var(--soft-2)' }}>+974</span>
                <input id="cm" className="input" type="tel" inputMode="numeric" maxLength={8} value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digits" />
              </div>
              <span className="small muted">You will use this number to open your club page again.</span>
            </div>
            <div className="field"><label htmlFor="ce">Email (optional)</label><input id="ce" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            {err && <div className="notice error">{err}</div>}
            <button className="btn primary" style={{ minHeight: 52 }} disabled={busy}>{busy ? 'Opening…' : 'Register and continue'}</button>
          </form>
        ) : (
          <form onSubmit={open} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="lc">Your club</label>
              <select id="lc" className="input" value={login.club_id} onChange={(e) => setLogin({ ...login, club_id: e.target.value })}>
                <option value="">Choose your club</option>
                {(clubs || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {pickedNew && (
              <div className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span><strong>{pickedNew.name}</strong> is on the list but has not been registered by its coach yet. Register it first (coach name and mobile) — it takes a minute.</span>
                <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => { setMode('new'); setErr(''); setF((p) => ({ ...p, club_id: pickedNew.id })) }}>Register {pickedNew.name}</button>
              </div>
            )}
            <div className="field">
              <label htmlFor="lm">Coach mobile used to register</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="input" style={{ width: 'auto', display: 'flex', alignItems: 'center', fontWeight: 700, background: 'var(--soft-2)' }}>+974</span>
                <input id="lm" className="input" type="tel" inputMode="numeric" maxLength={8} value={login.mobile} onChange={(e) => setLogin({ ...login, mobile: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="8 digits" />
              </div>
            </div>
            {err && <div className="notice error">{err}</div>}
            <button className="btn primary" style={{ minHeight: 52 }} disabled={busy}>{busy ? 'Opening…' : 'Open my club page'}</button>
          </form>
        )}
        <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Questions? <a href="mailto:aquaticmanager@vortexaquatics.com">aquaticmanager@vortexaquatics.com</a></p>
      </div>
      {meet?.sponsor_banner && (
        <footer style={{ borderTop: '1px solid var(--line)', padding: '20px', display: 'flex', justifyContent: 'center' }}>
          <img src={meet.sponsor_banner} alt="Meet sponsors" style={{ maxWidth: 'min(100%, 720px)', maxHeight: 90, objectFit: 'contain' }} />
        </footer>
      )}
    </div>
  )
}
