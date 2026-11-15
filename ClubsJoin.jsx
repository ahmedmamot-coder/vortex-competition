import { useEffect, useState } from 'react'
import logoH from './logo-competition.svg'
import { supabase } from './supabase.js'

// One link for every club, one form: choose the club from the list (clubs imported
// from entries are already there) or add a new one. First visit sets the coach and
// mobile; later visits only ask for that mobile.
// Either way the club lands on its own private page to add the logo and swimmers.
export default function ClubsJoin() {
  const [meet, setMeet] = useState(null)
  const [clubs, setClubs] = useState(null)
  const [f, setF] = useState({ club_id: '', name: '', code: '', coach: '', mobile: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('vc_meet').select('id,name,venue,meet_date,sponsor_banner').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setMeet(data?.[0] || null))
    supabase.rpc('vc_clubs_public').then(({ data }) => setClubs(data || []))
  }, [])

  const list = clubs || []
  const picked = list.find((c) => c.id === f.club_id) || null
  const isNew = f.club_id === 'new'
  // A club whose coach already opened the page: only the mobile is asked.
  const returning = !!picked?.claimed
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const go = (key) => { window.location.href = `/club?key=${key}` }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!f.club_id) return setErr('Choose your club from the list, or choose “My club is not in this list”.')
    if (isNew && f.name.trim().length < 2) return setErr('Enter your club or academy name.')
    if (!returning && f.coach.trim().split(/\s+/).length < 2) return setErr('Enter the coach or team manager’s full name.')
    if (!/^\d{8}$/.test(f.mobile)) return setErr(returning ? 'Enter the 8-digit mobile number used to register the club.' : 'Enter an 8-digit Qatar mobile number.')
    setBusy(true)
    if (returning) {
      const { data, error } = await supabase.rpc('vc_club_login', { p_club_id: f.club_id, p_mobile: f.mobile })
      setBusy(false)
      if (error || !data) return setErr('That mobile number does not match this club. Contact the organizers if you need help.')
      return go(data)
    }
    const { data, error } = await supabase.rpc('vc_club_signup', { p_club_id: isNew ? null : f.club_id, p_name: isNew ? f.name : '', p_code: isNew ? f.code : '', p_coach: f.coach, p_mobile: f.mobile, p_email: f.email })
    setBusy(false)
    if (error) {
      if (/already registered/.test(error.message)) { setClubs(list.map((c) => (c.id === f.club_id ? { ...c, claimed: true } : c))); return setErr('This club was already opened by its coach. Enter the mobile number used then.') }
      if (/already listed/.test(error.message)) return setErr('This club is already in the list above. Choose it there.')
      return setErr('Could not open the club page. Please check the details and try again.')
    }
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

        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="cl">Your club</label>
            <select id="cl" className="input" value={f.club_id} onChange={(e) => { setErr(''); set('club_id', e.target.value) }}>
              <option value="">{clubs ? 'Choose your club' : 'Loading clubs…'}</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">My club is not in this list — add it</option>
            </select>
            <span className="small muted">Most clubs are already listed from their entries. Look for your club’s name before adding a new one.</span>
          </div>
          {picked && !returning && picked.registered && <div className="notice">Your club is registered and your entries are already loaded. First time here: enter the coach name and the mobile number you will use to open this page again.</div>}
          {returning && <div className="notice">Welcome back. Enter the coach mobile number used the first time.</div>}
          {isNew && (
            <>
              <div className="field"><label htmlFor="cn">Club or academy name</label><input id="cn" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="field">
                <label htmlFor="cc">Team code in HY-TEK (if you know it)</label>
                <input id="cc" className="input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase().slice(0, 12))} placeholder="e.g. VTX" />
                <span className="small muted">The short team code used in your HY-TEK entries. Leave empty if you are not sure.</span>
              </div>
            </>
          )}
          {f.club_id && !returning && <div className="field"><label htmlFor="co">Coach or team manager full name</label><input id="co" className="input" autoComplete="name" value={f.coach} onChange={(e) => set('coach', e.target.value)} /></div>}
          {f.club_id && (
            <div className="field">
              <label htmlFor="cm">{returning ? 'Coach mobile used to register' : 'Mobile number'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="input" style={{ width: 'auto', display: 'flex', alignItems: 'center', fontWeight: 700, background: 'var(--soft-2)' }}>+974</span>
                <input id="cm" className="input" type="tel" inputMode="numeric" maxLength={8} value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digits" />
              </div>
              {!returning && <span className="small muted">You will use this number to open your club page again.</span>}
            </div>
          )}
          {f.club_id && !returning && <div className="field"><label htmlFor="ce">Email (optional)</label><input id="ce" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>}
          {err && <div className="notice error">{err}</div>}
          <button className="btn primary" style={{ minHeight: 52 }} disabled={busy}>{busy ? 'Opening…' : 'Open my club page'}</button>
        </form>
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
