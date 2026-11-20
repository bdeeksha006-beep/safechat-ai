import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) { setProfile(null); return }
    
    async function loadProfile() {
      const { data: existing } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (existing) {
        setProfile(existing)
        return
      }
      
      // Create profile if missing
      const meta = user.user_metadata || {}
      const baseUsername = meta.username || user.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') || 'user_' + user.id.slice(0,8)
      const displayName = meta.display_name || meta.name || meta.full_name || baseUsername
      
      // Ensure unique username
      let username = baseUsername
      let attempts = 0
      while (attempts < 5) {
        const { data: conflict } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
        if (!conflict) break
        username = baseUsername + '_' + Math.random().toString(36).slice(2, 6)
        attempts++
      }
      
      const { data: newProfile, error } = await supabase.from('profiles').insert({
        id: user.id,
        username,
        display_name: displayName,
      }).select().single()
      
      if (error) {
        console.error('Profile creation error:', error)
        // Set a minimal profile to prevent crash
        setProfile({ id: user.id, username, display_name: displayName, is_online: true })
      } else {
        setProfile(newProfile)
      }
    }
    
    loadProfile()
  }, [user])

  const signOut = () => supabase.auth.signOut()

  return { user, profile, loading, signOut }
}
