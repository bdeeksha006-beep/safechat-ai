import { supabase } from '../lib/supabase'
import { analyzeConversation } from '../lib/ai'
import { aggregateConversation } from './rules'

// In-memory cache: conversationId -> { result, at, ai }
const cache = new Map()
const pending = new Map()

export function getCachedAnalysis(conversationId) {
  return cache.get(conversationId) || null
}

function setCache(conversationId, result, ai = false) {
  cache.set(conversationId, { result, at: Date.now(), ai })
}

// Load persisted analysis from DB (fast path on conversation open).
export async function loadStoredAnalysis(conversationId) {
  const { data } = await supabase
    .from('safety_analyses')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) {
    const result = data.result || {}
    setCache(conversationId, { ...result, riskScore: data.risk_score, safetyScore: data.safety_score, riskLevel: data.risk_level }, data.source === 'ai')
    return cache.get(conversationId).result
  }
  return null
}

// Persist analysis result.
export async function persistAnalysis(conversationId, result, source, userId) {
  await supabase.from('safety_analyses').insert({
    conversation_id: conversationId,
    user_id: userId,
    source,
    risk_score: result.riskScore ?? result.risk_score ?? 0,
    safety_score: result.safetyScore ?? result.safety_score ?? 100,
    risk_level: result.riskLevel ?? result.risk_level ?? 'MINIMAL',
    result,
    analyzed_at: new Date().toISOString(),
  })
}

// Core analysis: run rule engine immediately, then try AI (debounced).
// messages: [{id, sender_id, text, created_at}]
export async function analyzeConversationMessages(conversationId, messages, { userId, useAi = true, onResult } = {}) {
  const ruleResult = aggregateConversation(messages)
  const notify = (r) => { if (onResult) try { onResult(r) } catch {} }

  if (!useAi) {
    setCache(conversationId, { result: ruleResult, at: Date.now(), ai: false })
    notify(ruleResult)
    return ruleResult
  }

  try {
    const aiResult = await analyzeConversation({
      conversationId,
      messages: messages.slice(-40).map(m => ({ id: m.id, sender_id: m.sender_id, text: m.text || m.content, created_at: m.created_at })),
    })
    const merged = mergeResults(ruleResult, aiResult)
    setCache(conversationId, { result: merged, at: Date.now(), ai: true })
    notify(merged)
    if (userId) persistAnalysis(conversationId, merged, 'ai', userId).catch(() => {})
    return merged
  } catch (err) {
    // AI unavailable -> rule result, flagged.
    const fallback = { ...ruleResult, aiUnavailable: true, aiError: err.message }
    setCache(conversationId, { result: fallback, at: Date.now(), ai: false })
    notify(fallback)
    if (userId) persistAnalysis(conversationId, ruleResult, 'rules', userId).catch(() => {})
    return fallback
  }
}

export function scheduleAnalysis(conversationId, messages, opts, delayMs = 1500) {
  if (pending.has(conversationId)) clearTimeout(pending.get(conversationId))
  const t = setTimeout(() => {
    pending.delete(conversationId)
    analyzeConversationMessages(conversationId, messages, opts).catch(() => {})
  }, delayMs)
  pending.set(conversationId, t)
}

// Merge rule-engine output with AI JSON output.
function mergeResults(rule, ai) {
  if (!ai || typeof ai !== 'object') return rule
  // Edge function signals: fallback (AI failed) or skipped (privacy opt-out).
  if (ai.fallback || ai.skipped || ai.risk_score == null) {
    return { ...rule, aiUnavailable: true, aiError: ai.error || ai.reason || 'AI unavailable' }
  }
  const aiRisk = typeof ai.risk_score === 'number' ? ai.risk_score : null
  const aiSafety = typeof ai.safety_score === 'number' ? ai.safety_score : null
  const merged = { ...rule }
  if (aiRisk != null) merged.aiRiskScore = aiRisk
  if (aiSafety != null) merged.aiSafetyScore = aiSafety
  if (ai.risk_level) merged.aiRiskLevel = ai.risk_level
  if (Array.isArray(ai.scam_categories)) merged.aiCategories = ai.scam_categories
  if (Array.isArray(ai.evidence)) merged.aiEvidence = ai.evidence
  if (Array.isArray(ai.detected_patterns)) merged.aiPatterns = ai.detected_patterns
  if (Array.isArray(ai.recommendations)) merged.recommendations = ai.recommendations
  if (ai.analysis_summary) merged.aiSummary = ai.analysis_summary
  if (ai.confidence != null) merged.aiConfidence = ai.confidence
  merged.aiAvailable = true
  // Prefer AI score when present (validated), else rule score.
  if (aiRisk != null) {
    merged.riskScore = aiRisk
    merged.safetyScore = aiSafety ?? Math.max(0, 100 - aiRisk)
    merged.riskLevel = (ai.risk_level || rule.riskLevel)
  }
  return merged
}
