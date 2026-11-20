import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

// AI client with dual backend:
//  1) Supabase Edge Functions (/functions/v1/analyze|ask) — preferred,
//     uses OPENROUTER_API_KEY stored in Supabase secrets.
//  2) Netlify Functions (/.netlify/functions/analyze|ask) — fallback,
//     uses env vars set in Netlify (OPENROUTER_API_KEY etc.).
// API keys never reach the browser in either case.

const FN_BASE = `${SUPABASE_URL}/functions/v1`
const API_BASE = '/api'

async function post(url, payload, useJwt) {
  const headers = { 'Content-Type': 'application/json' }
  if (useJwt) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
    headers.apikey = SUPABASE_ANON_KEY
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `AI request failed (${res.status})`)
    err.code = data.code || 'AI_ERROR'
    err.fallback = data.fallback === true
    err.status = res.status
    throw err
  }
  return data
}

// Try Supabase function; on ANY failure fall back to Vercel API.
async function call(fn, payload) {
  try {
    return await post(`${FN_BASE}/${fn}`, payload, true)
  } catch (err) {
    try {
      return await post(`${API_BASE}/${fn}`, payload, true)
    } catch (err2) {
      // Surface the more informative error
      throw err2.status === 404 ? err : err2
    }
  }
}

export const analyzeConversation = (payload) => call('analyze', payload)
export const askAssistant = (payload) => call('ask', payload)
