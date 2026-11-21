import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save, Bell, BellOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getNotificationPreferences, updateNotificationPreferences, subscribeToPush, unsubscribeFromPush, isPushSupported } from '../services/push'

export default function SettingsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [privacy, setPrivacy] = useState(null)
  const [notifs, setNotifs] = useState(null)
  const [saved, setSaved] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => setProfile(data))
    supabase.from('user_privacy_settings').select('*').eq('user_id', user.id).maybeSingle().then(async ({ data }) => {
      if (data) {
        setPrivacy(data)
      } else {
        // Row missing (profile was created manually) — create defaults
        const defaults = { user_id: user.id, ai_analysis_enabled: true, retain_analyses_days: 90 }
        const { data: created } = await supabase.from('user_privacy_settings').insert(defaults).select().single()
        setPrivacy(created || defaults)
      }
    })
    getNotificationPreferences(user.id).then((data) => {
      if (data) setNotifs(data)
      else setNotifs({
        user_id: user.id,
        push_enabled: true,
        new_message_notifications: true,
        group_message_notifications: true,
        security_alert_notifications: true,
        sound_enabled: true,
        message_preview_enabled: false,
        muted_conversations: [],
      })
    })
  }, [user])

  async function save() {
    const { error: e1 } = await supabase.from('profiles').update({ display_name: profile.display_name, bio: profile.bio }).eq('id', user.id)
    if (e1) console.error('Profile save error:', e1)
    // Upsert in case the row doesn't exist yet
    const { error: e2 } = await supabase.from('user_privacy_settings')
      .upsert({ user_id: user.id, ai_analysis_enabled: privacy.ai_analysis_enabled, retain_analyses_days: privacy.retain_analyses_days })
    if (e2) console.error('Privacy save error:', e2)
    if (notifs) {
      await updateNotificationPreferences(user.id, notifs)
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function togglePush() {
    if (!isPushSupported()) {
      alert('Push notifications not supported in this browser')
      return
    }
    if (pushEnabled) {
      await unsubscribeFromPush(user.id)
      setPushEnabled(false)
    } else {
      const sub = await subscribeToPush(user.id)
      setPushEnabled(!!sub)
    }
  }

  if (!profile || !privacy || !notifs) return <div className="h-full grid place-items-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <Link to="/" className="p-1.5 hover:bg-gray-100 rounded"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-bold">Settings</h1>
      </div>
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold">Profile</h2>
          <div>
            <label className="text-xs text-gray-500">Display name</label>
            <input value={profile.display_name || ''} onChange={e => setProfile({ ...profile, display_name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Bio</label>
            <input value={profile.bio || ''} onChange={e => setProfile({ ...profile, bio: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div className="text-xs text-gray-400">Username: @{profile.username} · Email: {user.email}</div>
        </div>

        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold">AI Safety & Privacy</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={privacy.ai_analysis_enabled} onChange={e => setPrivacy({ ...privacy, ai_analysis_enabled: e.target.checked })} className="w-4 h-4" />
            <div>
              <div className="text-sm font-medium">Enable AI scam analysis</div>
              <div className="text-xs text-gray-500">Messages in your conversations may be sent to the configured AI provider for scam detection.</div>
            </div>
          </label>
          <div>
            <label className="text-xs text-gray-500">Keep analysis history for (days)</label>
            <input type="number" min={1} max={3650} value={privacy.retain_analyses_days}
              onChange={e => setPrivacy({ ...privacy, retain_analyses_days: +e.target.value })}
              className="w-32 border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <p className="text-[11px] text-gray-400">
            SafeChat AI is not end-to-end encrypted. Message content is stored on Supabase and may be processed by the AI provider when analysis is enabled.
          </p>
        </div>

        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={pushEnabled} onChange={togglePush} className="w-4 h-4" />
            <div>
              <div className="text-sm font-medium">Push notifications</div>
              <div className="text-xs text-gray-500">Get notified even when SafeChat is closed (requires browser permission)</div>
            </div>
          </label>
          {pushEnabled && (
            <div className="space-y-2 pl-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifs.new_message_notifications} onChange={e => setNotifs({ ...notifs, new_message_notifications: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm">New message notifications</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifs.group_message_notifications} onChange={e => setNotifs({ ...notifs, group_message_notifications: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm">Group message notifications</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifs.security_alert_notifications} onChange={e => setNotifs({ ...notifs, security_alert_notifications: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm">Security alerts</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifs.message_preview_enabled} onChange={e => setNotifs({ ...notifs, message_preview_enabled: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm">Show message preview in notifications</span>
              </label>
            </div>
          )}
        </div>

        <button onClick={save} className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">
          <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
