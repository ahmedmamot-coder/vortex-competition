import { createClient } from '@supabase/supabase-js'

// Publishable (public) values — safe in the browser; data is protected by Row Level Security.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://qhrpwiakobgcxfmcoyfg.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xN0gsaZ5gK7B86v48KR-qQ_jnDSQF3W'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vortex-competition-auth' }
})
