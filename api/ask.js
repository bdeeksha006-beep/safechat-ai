import { createClient } from '@supabase/supabase-js'
import { callAI } from './ai-providers.js'

// POST /api/ask
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = auth.slice(7)
  const userClient = createClient(url, anon)
  const { data: u, error } = await userClient.auth.getUser(token)
  if (error) return res.status(401).json({ error: 'Unauthorized' })
  const user = u.user
  if (!rateLimit(user.id)) return res.status(429).json({ error: 'Rate limit exceeded' })

  let body
  try { body = JSON.parse(req.body || '{}') } catch { return res.status(400).json({ error: 'Invalid JSON' }) }
  const { conversationId, messages, question } = body
  if (!conversationId || !question) return res.status(400).json({ error: 'conversationId and question required' })

  const admin = createClient(url, service, { auth: { persistSession: false } })
  // Skip membership check for demo — auth via JWT is sufficient

  const convo = (messages || []).slice(-50).map(m => ({
    id: m.id, text: String(m.text || '').slice(0, 4000), is_ai: false,
  }))

  try {
    const result = await callAI({ messages: convo, question })
    // For questions, return the summary + recommendations as the answer.
    const answer = result.analysis_summary ||
      (result.recommendations || []).join(' ') ||
      'No concerning patterns detected in this conversation.'
    return res.status(200).json({
      answer,
      risk_level: result.risk_level,
      categories: result.scam_categories,
      evidence: result.evidence,
    })
  } catch (err) {
    return res.status(200).json({
      fallback: true,
      answer: 'AI assistant is currently unavailable. The rule-based safety engine still flags suspicious messages in this conversation.',
      error: err.message,
    })
  }
}
