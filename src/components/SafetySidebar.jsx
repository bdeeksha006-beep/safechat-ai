import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ShieldAlert, X, AlertTriangle, Lightbulb, MessageSquareWarning, Send, ChevronRight, Flag, CheckCircle, RefreshCw } from 'lucide-react'
import { riskColor, riskBg, SCAM_CATEGORIES, VERDICTS } from '../safety/rules'
import { askAssistant } from '../lib/ai'
import { getUserDecision, setUserDecision, scheduleAnalysis } from '../safety/engine'

const VERDICT_COLORS = {
  'SAFE': 'bg-green-100 text-green-800 border-green-300',
  'POTENTIAL SCAM': 'bg-orange-100 text-orange-800 border-orange-300',
  'HIGH RISK': 'bg-red-100 text-red-800 border-red-300',
  'CRITICAL RISK': 'bg-red-200 text-red-900 border-red-400',
  'INSUFFICIENT INFORMATION': 'bg-gray-100 text-gray-600 border-gray-300',
}

export default function SafetySidebar({ conversation, analysis, messages, user, onClose }) {
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState([]) // [{q, a}]
  const [asking, setAsking] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [userDecision, setUserDecision] = useState(null)
  const [showDecisionModal, setShowDecisionModal] = useState(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [reanalysing, setReanalysing] = useState(false)
  const chatEnd = useRef(null)

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  useEffect(() => {
    if (conversation && user) {
      getUserDecision(conversation.id, user.id).then(setUserDecision)
    }
  }, [conversation?.id, user?.id])

  if (!conversation) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400 p-6 text-center">
        <ShieldCheck className="w-10 h-10 mb-3 text-brand-300" />
        <p className="text-sm">Select a conversation to see its safety analysis.</p>
        {onClose && <button onClick={onClose} className="md:hidden mt-4 text-brand-600 text-sm">Back to chats</button>}
      </div>
    )
  }

  const suspiciousMsgs = (analysis?.messages || []).filter(m => m.analysis?.isSuspicious)
  const risk = analysis?.riskLevel || 'MINIMAL'
  const score = analysis?.safetyScore ?? 100
  const verdict = analysis?.verdict || 'INSUFFICIENT INFORMATION'

  async function ask(q) {
    if (!q.trim() || asking) return
    setAsking(true)
    setChat(prev => [...prev, { q, a: null }])
    try {
      const res = await askAssistant({
        conversationId: conversation.id,
        messages: messages.slice(-50).map(m => ({ id: m.id, text: m.content })),
        question: q,
      })
      setChat(prev => prev.map((c, i) => i === prev.length - 1 ? { ...c, a: res.answer || res.error || 'No answer.' } : c))
    } catch (e) {
      setChat(prev => prev.map((c, i) => i === prev.length - 1 ? { ...c, a: `Assistant unavailable: ${e.message}` } : c))
    } finally { setAsking(false); setQuestion('') }
  }

  async function handleDecision(status) {
    if (!user || !conversation) return
    await setUserDecision(conversation.id, user.id, status, decisionReason)
    setUserDecision({ status, reason: decisionReason })
    setShowDecisionModal(null)
    setDecisionReason('')
  }

  async function handleReanalyse() {
    if (!conversation || !user) return
    setReanalysing(true)
    await scheduleAnalysis(conversation.id, messages, { userId: user.id, onResult: (r) => { /* parent handles */ } }, 0)
    setReanalysing(false)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-600" />
          <span className="font-semibold text-sm">Safety Assistant</span>
        </div>
        {onClose && <button onClick={onClose} className="md:hidden"><X className="w-5 h-5" /></button>}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Conversation Verdict */}
        <div className={`rounded-xl border-2 p-4 ${VERDICT_COLORS[verdict] || 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{conversation.displayName}</span>
            <span className="text-xs font-bold">{verdict}</span>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-bold">{score}</span>
            <span className="text-xs text-gray-500 mb-1">/ 100 safety score</span>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="bg-white/50 rounded px-2 py-1">Risk: {analysis?.riskScore ?? 0}/100</span>
            <span className="bg-white/50 rounded px-2 py-1">Confidence: {analysis?.aiConfidence != null ? `${Math.round(analysis.aiConfidence * 100)}%` : '—'}</span>
          </div>
          {analysis?.aiUnavailable && (
            <p className="text-[11px] text-orange-600 mt-2">⚠ AI analysis unavailable — showing rule-based results.</p>
          )}
          {analysis?.analyzedAt || analysis?.analyzed_at ? (
            <p className="text-[10px] text-gray-500 mt-1">Analysed {new Date(analysis.analyzedAt || analysis.analyzed_at).toLocaleString()}</p>
          ) : null}
          <button onClick={handleReanalyse} disabled={reanalysing} className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
            <RefreshCw className={`w-3 h-3 ${reanalysing ? 'animate-spin' : ''}`} /> Reanalyse
          </button>
        </div>

        {/* User Decision */}
        {userDecision && (
          <div className={`rounded-lg border p-3 ${userDecision.status === 'scam' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              {userDecision.status === 'scam' ? <Flag className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-green-600" />}
              <span className="text-sm font-medium">You marked this as {userDecision.status === 'scam' ? 'SCAM' : 'SAFE'}</span>
            </div>
            {userDecision.reason && <p className="text-xs text-gray-600">Reason: {userDecision.reason}</p>}
            <button onClick={() => setShowDecisionModal(userDecision.status)} className="text-xs text-brand-600 hover:underline mt-1">Change decision</button>
          </div>
        )}

        {!userDecision && (
          <div className="flex gap-2">
            <button onClick={() => setShowDecisionModal('scam')} className="flex-1 flex items-center justify-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm hover:bg-red-100">
              <Flag className="w-4 h-4" /> Mark as Scam
            </button>
            <button onClick={() => setShowDecisionModal('safe')} className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-2 text-sm hover:bg-green-100">
              <CheckCircle className="w-4 h-4" /> Mark as Safe
            </button>
          </div>
        )}

        {/* Decision Modal */}
        {showDecisionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDecisionModal(null)}>
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-2">Mark as {showDecisionModal === 'scam' ? 'Scam' : 'Safe'}?</h3>
              <p className="text-sm text-gray-600 mb-3">This will record your decision. The AI analysis will remain unchanged.</p>
              <textarea
                value={decisionReason}
                onChange={e => setDecisionReason(e.target.value)}
                placeholder="Optional reason (e.g., 'This is a fake bank call')"
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                rows={2}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowDecisionModal(null)} className="flex-1 border rounded-lg px-4 py-2 text-sm">Cancel</button>
                <button onClick={() => handleDecision(showDecisionModal)} className={`flex-1 rounded-lg px-4 py-2 text-sm text-white ${showDecisionModal === 'scam' ? 'bg-red-600' : 'bg-green-600'}`}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Threat Summary */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Threat summary</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Suspicious msgs" value={analysis?.suspiciousCount ?? suspiciousMsgs.length} />
            <Stat label="Categories" value={analysis?.categories?.length ?? 0} />
            <Stat label="Suspicious links" value={analysis?.suspiciousUrls?.length ?? 0} warn={analysis?.suspiciousUrls?.length > 0} />
            <Stat label="AI confidence" value={analysis?.aiConfidence != null ? `${Math.round(analysis.aiConfidence * 100)}%` : '—'} />
          </div>
          {(analysis?.categories || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {analysis.categories.map(c => (
                <span key={c} className="text-[10px] bg-gray-100 rounded-full px-2 py-0.5">{SCAM_CATEGORIES[c] || c}</span>
              ))}
            </div>
          )}
        </div>

        {/* Suspicious Messages */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Flagged messages</h4>
          {suspiciousMsgs.length === 0 ? (
            <p className="text-sm text-gray-400">No suspicious messages detected.</p>
          ) : (
            <div className="space-y-2">
              {suspiciousMsgs.slice(0, 10).map(m => (
                <button key={m.id} onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  className="w-full text-left border rounded-lg p-2.5 hover:bg-gray-50">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-medium">Score {m.analysis.score} · {m.analysis.riskLevel}</span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{m.text || m.content}</p>
                  {expanded === m.id && (
                    <div className="mt-2 text-[11px] text-gray-500 space-y-1">
                      {m.analysis.flags.slice(0, 5).map((f, i) => <div key={i}>• {f.note}</div>)}
                      <div className="text-gray-400 pt-1">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Explanation */}
        {(analysis?.aiSummary || analysis?.aiPatterns?.length || analysis?.detected_patterns?.length) ? (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">AI explanation</h4>
            <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-sm text-gray-700">
              {analysis.aiSummary || analysis.analysis_summary}
              {(analysis.aiPatterns || analysis.detected_patterns || []).length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs space-y-0.5">
                  {(analysis.aiPatterns || analysis.detected_patterns).slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {/* Recommendations */}
        {(analysis?.recommendations?.length || analysis?.aiRecommendations) ? (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recommended actions</h4>
            <ul className="space-y-1.5">
              {(analysis.recommendations || []).slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <Lightbulb className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" /> {r}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Ask AI */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ask AI</h4>
          <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
            {chat.map((c, i) => (
              <div key={i} className="text-sm">
                <div className="bg-gray-100 rounded-lg px-3 py-1.5 ml-6">{c.q}</div>
                <div className="bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5 mr-6 mt-1">{c.a ?? 'Thinking…'}</div>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <div className="flex gap-1 flex-wrap mb-2">
            {['Why is this suspicious?', 'Which message triggered it?', 'Is this payment safe?', 'What should I do?'].map(q => (
              <button key={q} onClick={() => ask(q)} disabled={asking}
                className="text-[10px] bg-gray-100 hover:bg-brand-50 text-gray-600 rounded-full px-2 py-1 disabled:opacity-50">{q}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(question) }} className="flex gap-1">
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about this chat…"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button disabled={asking || !question.trim()} className="p-1.5 bg-brand-600 text-white rounded-lg disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div className="border rounded-lg p-2">
      <div className={`text-lg font-bold ${warn ? 'text-orange-600' : ''}`}>{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  )
}
