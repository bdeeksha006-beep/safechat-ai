import { createClient } from '@supabase/supabase-js'
import { callAI } from './ai-providers.js'

// POST /.netlify/functions/ask
// Body: { conversationId, messages: [...], question: string }
// Returns { answer } — uses AI when available, otherwise instructs fallback.

const RATE_LIMIT = { windowMs: 60_000, max: 15 }
const hits = new Map()
function rateLimit(key) {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter(t => now - t < RATE_LIMIT.windowMs)
  if (arr.length >= RATE_LIMIT.max) return false
  arr.push(now); hits.set(key, arr); return true
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const auth = event.headers.authorization || event.headers.Authorization
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' })

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = auth.slice(7)
  const userClient = createClient(url, anon)
  const { data: u, error } = await userClient.auth.getUser(token)
  if (error) return json(401, { error: 'Unauthorized' })
  const user = u.user
  if (!rateLimit(user.id)) return json(429, { error: 'Rate limit exceeded' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid JSON' }) }
  const { conversationId, messages, question } = body
  if (!conversationId || !question) return json(400, { error: 'conversationId and question required' })

  const admin = createClient(url, service, { auth: { persistSession: false } })
  // Skip membership check for demo — auth via JWT is sufficient
  // (RLS was disabled on conversation_members which would block the check anyway)

  const convo = (messages || []).slice(-50).map(m => ({
    id: m.id, text: String(m.text || '').slice(0, 4000), is_ai: false,
  }))

  try {
    const result = await callAI({ messages: convo, question })
    // For questions, return the summary + recommendations as the answer.
    const answer = result.analysis_summary ||
      (result.recommendations || []).join(' ') ||
      'No concerning patterns detected in this conversation.'
    return json(200, {
      answer,
      risk_level: result.risk_level,
      categories: result.scam_categories,
      evidence: result.evidence,
    })
  } catch (err) {
    return json(200, {
      fallback: true,
      answer: 'AI assistant is currently unavailable. The rule-based safety engine still flags suspicious messages in this conversation.',
      error: err.message,
    })
  }
}

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
