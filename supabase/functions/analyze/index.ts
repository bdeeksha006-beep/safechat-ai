// SafeChat AI — conversation scam analysis endpoint.
// POST /functions/v1/analyze  { conversationId, messages: [{id, text, sender_id, created_at}] }
// Auth: user's Supabase JWT (verify_jwt enabled by default).

import { corsPreflight, json, callOpenRouter, rateLimit, cacheGet, cacheSet, adminClient, getUser, isMember, messagesHash } from '../_shared/openrouter.ts'

const MAX_MESSAGES = 60

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight()
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const user = await getUser(req.headers.get('authorization'))
  if (!user) return json(401, { error: 'Unauthorized' })
  if (!rateLimit(`analyze:${user.id}`, 30, 60_000)) return json(429, { error: 'Rate limit exceeded', code: 'RATE_LIMIT' })

  let body: any
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }
  const { conversationId, messages } = body || {}
  if (!conversationId || !Array.isArray(messages)) return json(400, { error: 'conversationId and messages[] required' })

  const admin = adminClient()
  if (!(await isMember(admin, conversationId, user.id))) return json(403, { error: 'Not a member of this conversation' })

  // Respect AI opt-out.
  const { data: privacy } = await admin.from('user_privacy_settings')
    .select('ai_analysis_enabled').eq('user_id', user.id).maybeSingle()
  if (privacy && privacy.ai_analysis_enabled === false) {
    return json(200, { skipped: true, reason: 'AI analysis disabled in privacy settings' })
  }

  const clean = messages.slice(-MAX_MESSAGES).map((m: any) => ({
    id: String(m.id || ''),
    text: String(m.text || m.content || '').slice(0, 4000),
    is_ai: false,
    sender_id: m.sender_id,
    created_at: m.created_at,
  }))
  if (!clean.length) return json(400, { error: 'No messages to analyse' })

  // Dedup/cache: skip if identical message set was analysed recently.
  const hash = messagesHash(clean)
  const cacheKey = `${conversationId}:${user.id}:${hash}`
  const cached = cacheGet(cacheKey)
  if (cached) return json(200, { ...(cached as object), cached: true })

  try {
    const result = await callOpenRouter({ messages: clean })
    cacheSet(cacheKey, result)

    // Persist analysis (service role bypasses RLS; we verified membership above).
    const { data: inserted } = await admin.from('safety_analyses').insert({
      conversation_id: conversationId,
      user_id: user.id,
      source: 'ai',
      risk_score: (result as any).risk_score ?? 0,
      safety_score: (result as any).safety_score ?? 100,
      risk_level: (result as any).risk_level ?? 'MODERATE',
      result,
      analyzed_at: new Date().toISOString(),
    }).select('id').single()

    // Persist per-message suspicion + alert on high risk.
    const evidenceIds = new Set(((result as any).evidence || []).map((e: any) => e.message_id))
    if (evidenceIds.size) {
      const rows = [...evidenceIds].map(mid => ({
        message_id: mid, conversation_id: conversationId, user_id: user.id,
        score: (result as any).risk_score ?? 50, categories: (result as any).scam_categories ?? [], flags: [],
      })).filter(r => clean.some(m => m.id === r.message_id))
      if (rows.length) await admin.from('suspicious_messages').upsert(rows, { onConflict: 'message_id' }).then(() => {}).catch(() => {})
    }

    if ((result as any).is_suspicious && ['HIGH', 'CRITICAL'].includes(String((result as any).risk_level))) {
      await admin.from('safety_alerts').insert({
        user_id: user.id, conversation_id: conversationId,
        level: (result as any).risk_level,
        title: `Safety alert: ${(result as any).risk_level} risk detected`,
        detail: String((result as any).analysis_summary || '').slice(0, 500),
        categories: (result as any).scam_categories ?? [],
      }).then(() => {}).catch(() => {})
    }

    return json(200, { ...result, analysis_id: inserted?.id, provider: 'openrouter' })
  } catch (err: any) {
    // Graceful degradation: client falls back to rule engine.
    return json(200, {
      fallback: true,
      error: err?.message || 'AI unavailable',
      code: err?.code || 'AI_ERROR',
    })
  }
})
