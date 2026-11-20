import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { ShieldCheck } from 'lucide-react'

export default function AuthPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register | reset
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (error) throw error
      } else if (mode === 'register') {
        const username = form.username.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('Username: 3-20 chars, letters/numbers/underscore')
        const { error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { username, display_name: form.name || username } },
        })
        if (error) throw error
        setInfo('Account created. Check your email to confirm, then log in.')
        setMode('login')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/auth`,
        })
        if (error) throw error
        setInfo('Password reset link sent to your email.')
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-full grid place-items-center bg-gradient-to-br from-brand-50 to-gray-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-600 grid place-items-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">SafeChat AI</h1>
            <p className="text-xs text-gray-500">Messaging with scam protection</p>
          </div>
        </div>

        <div className="flex gap-2 mb-5 text-sm">
          {[['login', 'Login'], ['register', 'Register'], ['reset', 'Reset']].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setError(''); setInfo('') }}
              className={`flex-1 py-1.5 rounded-lg font-medium ${mode === k ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {l}
            </button>
          ))}
        </div>

        {error && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        {info && <div className="mb-3 text-sm text-brand-700 bg-brand-50 rounded-lg px-3 py-2">{info}</div>}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <input required placeholder="Full name" value={form.name} onChange={set('name')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <input required placeholder="Username (e.g. rahul_99)" value={form.username} onChange={set('username')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </>
          )}
          {mode !== 'register' || true ? (
            <input required type="email" placeholder="Email" value={form.email} onChange={set('email')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          ) : null}
          {mode !== 'reset' && (
            <input required type="password" minLength={6} placeholder="Password" value={form.password} onChange={set('password')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          )}
          <button disabled={busy}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-gray-400 text-center">
          By continuing you agree to our privacy notice: your messages may be analysed by the scam-detection system.
        </p>
      </div>
    </div>
  )
}
