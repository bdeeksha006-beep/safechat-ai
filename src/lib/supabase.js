import { createClient } from '@supabase/supabase-js'

// Temporarily hardcoded for deployment - will revert to env vars after testing
export const SUPABASE_URL = 'https://nwmzpwnagyvhykndccrs.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_iAhKDRG6a6GxCnm72-lOWA_BIY-s--N'

const url = SUPABASE_URL
const anonKey = SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
})
