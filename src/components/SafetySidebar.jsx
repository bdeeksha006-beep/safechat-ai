import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ShieldAlert, X, AlertTriangle, Lightbulb, MessageSquareWarning, Send, ChevronRight } from 'lucide-react'
import { riskColor, riskBg, SCAM_CATEGORIES } from '../safety/rules'
import { askAssistant } from '../lib/ai'

export default function SafetySidebar({ conversation, analysis, messages, user, onClose }) {
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState([]) // [{q, a}]
  const [asking, setAsking] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const chatEnd = useRef(null)

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

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
        {/* Section 1: overview */}
        <div className={`rounded-xl border p-4 ${riskBg(risk)}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{conversation.displayName}</span>
            <span className={`text-xs font-bold ${riskColor(risk)}`}>{risk}</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold">{score}</span>
            <span className="text-xs text-gray-500 mb-1">/ 100 safety score</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Score reflects detected communication risk only — not proof of wrongdoing.
          </p>
          {analysis?.aiUnavailable && (
            <p className="text-[11px] text-orange-600 mt-1">⚠ AI analysis unavailable — showing rule-based results.</p>
          )}
          {analysis?.analyzedAt || analysis?.analyzed_at ? (
            <p className="text-[10px] text-gray-400 mt-1">Analysed {new Date(analysis.analyzedAt || analysis.analyzed_at).toLocaleString()}</p>
          ) : null}
        </div>

        {/* Section 2: threat summary */}
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

        {/* Section 3: suspicious messages */}
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

        {/* Section 4: AI explanation */}
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

        {/* Section 5: recommendations */}
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

        {/* Section 6: Ask AI */}
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
