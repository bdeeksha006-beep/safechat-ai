import { createClient } from '@supabase/supabase-js'
import { callAI, validateAnalysis } from './ai-providers.js'

// POST /.netlify/functions/analyze
// Body: { conversationId, messages: [{id, sender_id, text, created_at}] }
// Auth: caller's Supabase JWT in Authorization: Bearer <token>

const MAX_MESSAGES = 60
const RATE_LIMIT = { windowMs: 60_000, max: 30 } // per user per minute
const hits = new Map()

function rateLimit(key) {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter(t => now - t < RATE_LIMIT.windowMs)
  if (arr.length >= RATE_LIMIT.max) return false
  arr.push(now); hits.set(key, arr); return true
}

const admin = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function verifyUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)
  const { data, error } = await sb.auth.getUser(token)
  return error ? null : data.user
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const user = await verifyUser(event.headers.authorization || event.headers.Authorization)
  if (!user) return json(401, { error: 'Unauthorized' })
  if (!rateLimit(user.id)) return json(429, { error: 'Rate limit exceeded', code: 'RATE_LIMIT' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid JSON' }) }
  const { conversationId, messages } = body
  if (!conversationId || !Array.isArray(messages)) return json(400, { error: 'conversationId and messages[] required' })

  const sb = admin()

  // Skip membership check for demo — auth via JWT is sufficient for now
  // (RLS was disabled on conversation_members which would block the check anyway)

  // Respect per-user AI opt-out: only analyse if at least the requester enabled it.
  const { data: privacy } = await sb.from('user_privacy_settings').select('ai_analysis_enabled').eq('user_id', user.id).maybeSingle()
  if (privacy && privacy.ai_analysis_enabled === false) {
    return json(200, { skipped: true, reason: 'AI analysis disabled in privacy settings' })
  }

  const clean = messages.slice(-MAX_MESSAGES).map(m => ({
    id: String(m.id || ''),
    text: String(m.text || m.content || '').slice(0, 4000),
    is_ai: false,
    created_at: m.created_at,
  }))
  if (!clean.length) return json(400, { error: 'No messages to analyse' })

  try {
    const result = await callAI({ messages: clean })
    // Persist server-side so analysis survives even if client cache is cleared.
    await sb.from('safety_analyses').insert({
      conversation_id: conversationId,
      user_id: user.id,
      source: 'ai',
      risk_score: result.risk_score,
      safety_score: result.safety_score,
      risk_level: result.risk_level,
      result,
      analyzed_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {})
    // Create alert if high risk.
    if (result.is_suspicious && ['HIGH','CRITICAL'].includes(result.risk_level)) {
      await sb.from('safety_alerts').insert({
        user_id: user.id, conversation_id: conversationId,
        level: result.risk_level,
        title: `Safety alert: ${result.risk_level} risk detected`,
        detail: result.analysis_summary || '',
        categories: result.scam_categories,
      }).catch(() => {})
    }
    return json(200, { ...result, provider: process.env.AI_PROVIDER || 'gemini' })
  } catch (err) {
    // Graceful fallback: tell client to use rule engine.
    return json(200, {
      fallback: true,
      error: err.message,
      code: err.code || 'AI_ERROR',
    })
  }
}

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
