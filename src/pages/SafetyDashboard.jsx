import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Download, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { SCAM_CATEGORIES, riskColor } from '../safety/rules'

export default function SafetyDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all') // all | HIGH | CRITICAL

  useEffect(() => {
    if (!user) return
    load()
    async function load() {
      const [analyses, alerts, susp] = await Promise.all([
        supabase.from('safety_analyses').select('*').eq('user_id', user.id).order('analyzed_at', { ascending: false }).limit(200),
        supabase.from('safety_alerts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('suspicious_messages').select('*').eq('user_id', user.id).limit(500),
      ])
      setData({ analyses: analyses.data || [], alerts: alerts.data || [], susp: susp.data || [] })
    }
  }, [user])

  if (!data) return <div className="h-full grid place-items-center text-gray-400">Loading…</div>

  const convCount = new Set(data.analyses.map(a => a.conversation_id)).size
  const highRisk = data.analyses.filter(a => ['HIGH','CRITICAL'].includes(a.risk_level))
  const catCount = {}
  data.susp.forEach(s => (s.categories || []).forEach(c => catCount[c] = (catCount[c] || 0) + 1))
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const filteredAlerts = data.alerts.filter(a => filter === 'all' || a.level === filter)

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'safechat-safety-report.json'; a.click()
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-1.5 hover:bg-gray-100 rounded"><ArrowLeft className="w-5 h-5" /></Link>
          <ShieldCheck className="w-6 h-6 text-brand-600" />
          <h1 className="text-lg font-bold">Safety Dashboard</h1>
        </div>
        <button onClick={downloadJSON} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700">
          <Download className="w-4 h-4" /> Export JSON
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card label="Conversations analysed" value={convCount} />
          <Card label="Suspicious contacts" value={highRisk.length} warn={highRisk.length > 0} />
          <Card label="Suspicious messages" value={data.susp.length} />
          <Card label="Open alerts" value={data.alerts.filter(a => !a.is_read).length} />
        </div>

        {/* Category distribution */}
        {topCats.length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Scam category distribution</h2>
            <div className="space-y-2">
              {topCats.map(([cat, n]) => (
                <div key={cat} className="flex items-center gap-3 text-sm">
                  <span className="w-48 truncate text-gray-600">{SCAM_CATEGORIES[cat] || cat}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4">
                    <div className="bg-brand-500 h-4 rounded-full" style={{ width: `${Math.min(100, n / data.susp.length * 100)}%` }} />
                  </div>
                  <span className="w-8 text-right font-medium">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent analyses */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-3">Recent contact safety</h2>
          <div className="space-y-2">
            {data.analyses.slice(0, 20).map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${riskColor(a.risk_level)}`}>{a.risk_level}</span>
                <span className="text-gray-500">Safety {a.safety_score}</span>
                <span className="text-gray-400 text-xs ml-auto">{new Date(a.analyzed_at).toLocaleString()}</span>
                <Link to={`/?conv=${a.conversation_id}`} className="text-brand-600 text-xs hover:underline">Open</Link>
              </div>
            ))}
            {data.analyses.length === 0 && <p className="text-sm text-gray-400">No analyses yet — start chatting.</p>}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Safety alerts</h2>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="text-sm border rounded-lg px-2 py-1">
              <option value="all">All levels</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredAlerts.map(a => (
              <div key={a.id} className={`flex items-start gap-3 text-sm p-3 rounded-lg border ${a.level === 'CRITICAL' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">{a.title}</div>
                  {a.detail && <div className="text-xs text-gray-600 mt-0.5">{a.detail.slice(0, 160)}</div>}
                  <div className="text-[10px] text-gray-400 mt-1">{new Date(a.created_at).toLocaleString()}</div>
                </div>
                <Link to={`/?conv=${a.conversation_id}`} className="text-xs text-brand-600 hover:underline shrink-0">Open chat</Link>
              </div>
            ))}
            {filteredAlerts.length === 0 && <p className="text-sm text-gray-400">No alerts.</p>}
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Automated detection is probabilistic. A high score indicates suspicious communication patterns, not proof of a crime. Verify independently before acting.
        </p>
      </div>
    </div>
  )
}

function Card({ label, value, warn }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={`text-2xl font-bold ${warn ? 'text-orange-600' : ''}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
