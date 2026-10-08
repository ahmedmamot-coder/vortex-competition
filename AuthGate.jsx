import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setIsAdmin(null); return }
    supabase.rpc('vc_is_admin').then(({ data, error }) => setIsAdmin(!error && data === true))
  }, [session])

  if (session === undefined || (session && isAdmin === null)) {
    return <div className="center-page muted">Loading…</div>
  }
  if (!session) return <Login />
  if (!isAdmin) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <img src="/logo-horizontal.svg" alt="Vortex Swimming Club" style={{ height: 48, alignSelf: 'flex-start' }} />
          <h1 style={{ fontSize: 24 }}>No access yet</h1>
          <p className="muted" style={{ margin: 0 }}>
            {session.user.email} is signed in but is not on the meet organizer list. Ask the meet manager to add this email in Setup → Organizer access.
          </p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  return children
}

function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const creds = { email: email.trim().toLowerCase(), password }
    const { error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword(creds)
      : await supabase.auth.signUp(creds)
    setBusy(false)
    if (error) setMsg({ type: 'error', text: error.message })
    else if (mode === 'signup') setMsg({ type: 'ok', text: 'Account created. Check your email to confirm it, then sign in here.' })
  }

  return (
    <div className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <img src="/logo-horizontal.svg" alt="Vortex Swimming Club" style={{ height: 48, alignSelf: 'flex-start' }} />
        <div>
          <div className="eyebrow blue">Vortex Competition</div>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>{mode === 'signin' ? 'Organizer sign in' : 'Create organizer account'}</h1>
          <p className="muted small" style={{ margin: '6px 0 0' }}>Call room, officials and staff management. Staff who want to work the meet should use the registration link instead.</p>
        </div>
        <div className="field">
          <label htmlFor="em">Email</label>
          <input id="em" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null) }}>
          {mode === 'signin' ? 'New organizer? Create an account' : 'Have an account? Sign in'}
        </button>
        <a href="/register" className="small" style={{ textAlign: 'center' }}>Staff registration form</a>
      </form>
    </div>
  )
}
