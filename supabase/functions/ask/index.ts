// SafeChat AI — "Ask AI" endpoint for the safety sidebar.
// POST /functions/v1/ask  { conversationId, messages: [...], question: string }

import { corsPreflight, json, callOpenRouter, rateLimit, adminClient, getUser, isMember } from '../_shared/openrouter.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight()
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const user = await getUser(req.headers.get('authorization'))
  if (!user) return json(401, { error: 'Unauthorized' })
  if (!rateLimit(`ask:${user.id}`, 15, 60_000)) return json(429, { error: 'Rate limit exceeded' })

  let body: any
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }
  const { conversationId, messages, question } = body || {}
  if (!conversationId || !question) return json(400, { error: 'conversationId and question required' })

  const admin = adminClient()
  if (!(await isMember(admin, conversationId, user.id))) return json(403, { error: 'Not a member' })

  const convo = (Array.isArray(messages) ? messages : []).slice(-50).map((m: any) => ({
    id: String(m.id || ''), text: String(m.text || m.content || '').slice(0, 4000), is_ai: false,
  }))

  try {
    const result = await callOpenRouter({ messages: convo, question: String(question).slice(0, 500) })
    const answer = String((result as any).analysis_summary || '') ||
      (((result as any).recommendations || []) as string[]).join(' ') ||
      'No concerning patterns detected in this conversation.'
    return json(200, {
      answer,
      risk_level: (result as any).risk_level,
      categories: (result as any).scam_categories,
      evidence: (result as any).evidence,
      model: (result as any).model,
    })
  } catch (err: any) {
    return json(200, {
      fallback: true,
      answer: 'AI assistant is currently unavailable. The rule-based safety engine still flags suspicious messages in this conversation.',
      error: err?.message,
    })
  }
})
