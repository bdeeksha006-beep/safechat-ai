import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Paperclip, Send, Smile, MoreVertical, Pencil, Trash2, ShieldAlert, ShieldCheck, Search } from 'lucide-react'
import { analyzeMessage, riskColor, riskBg, SCAM_CATEGORIES } from '../safety/rules'
import { validateFile, analyzeImageForQR } from '../safety/media'

const EMOJIS = ['😀','😂','🥰','😎','🤔','👍','👎','🙏','❤️','🎉','🔥','✅','❌','⚠️','💯','😭','😍','🤝','💪','✨']

export default function ChatWindow({ conversation, messages, user, analysis, onSend, onEdit, onDelete, onOpenSafety }) {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [menuFor, setMenuFor] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [file, setFile] = useState(null)
  const [fileWarning, setFileWarning] = useState('')
  const bottomRef = useRef(null)
  const fileRef = useRef(null)

  const isGroup = conversation.type === 'group'
  const title = conversation.displayName
  const suspiciousIds = new Set((analysis?.messages || []).filter(m => m.analysis?.isSuspicious).map(m => m.id))

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  function submit(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content && !file) return
    if (editing) { onEdit(editing, content); setEditing(null); setText(''); return }
    onSend(content || `[file] ${file?.name}`, file ? 'file' : 'text', replyTo, file || null)
    setText(''); setReplyTo(null); setFile(null); setShowEmoji(false)
  }

  const filtered = searchQ ? messages.filter(m => (m.content || '').toLowerCase().includes(searchQ.toLowerCase())) : messages

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b">
        <button className="md:hidden" onClick={onOpenSafety}><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold">
          {isGroup ? '👥' : (title || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{title}</div>
          <div className="text-[11px] text-gray-500">
            {isGroup ? `${conversation.members?.length || 0} members` : conversation.isOnline ? <span className="text-brand-600">online</span> : 'offline'}
          </div>
        </div>
        {analysis && (
          <button onClick={onOpenSafety} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${riskBg(analysis.riskLevel)}`} title="Safety analysis">
            {analysis.riskLevel === 'CRITICAL' || analysis.riskLevel === 'HIGH' ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            <span className={riskColor(analysis.riskLevel)}>{analysis.safetyScore}</span>
          </button>
        )}
        <button onClick={() => setSearchOpen(!searchOpen)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><Search className="w-4 h-4" /></button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 bg-white border-b">
          <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search in conversation…"
            className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin">
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 mt-8">No messages yet. Say hello!</p>}
        {filtered.map(m => {
          const mine = m.sender_id === user.id
          const flag = mine ? null : analyzeMessage(m.content || '')
          const showFlag = suspiciousIds.has(m.id) || (!!flag && flag.isSuspicious)
          return (
            <div key={m.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-[75%] rounded-2xl px-3 py-1.5 shadow-sm ${
                mine ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md'
              } ${m.is_deleted ? 'opacity-60 italic' : ''}`}>
                {isGroup && !mine && (
                  <div className="text-[11px] font-semibold text-brand-700 mb-0.5">{m.sender?.display_name || 'User'}</div>
                )}
                {m.reply_to && (
                  <div className={`text-[11px] rounded px-2 py-1 mb-1 ${mine ? 'bg-white/15' : 'bg-gray-100'}`}>
                    ↩ {messages.find(x => x.id === m.reply_to)?.content?.slice(0, 60) || 'message'}
                  </div>
                )}
                {m.is_deleted ? <span className="text-sm">This message was deleted</span> : (
                  <div className="text-sm whitespace-pre-wrap break-words">{linkify(m.content)}</div>
                )}
                <div className={`flex items-center gap-1 mt-0.5 ${mine ? 'text-brand-100 justify-end' : 'text-gray-400'}`}>
                  {m.is_edited && !m.is_deleted && <span className="text-[10px]">edited</span>}
                  <span className="text-[10px]">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {mine && <span className="text-[10px]">✓✓</span>}
                </div>
                {showFlag && (
                  <button onClick={onOpenSafety}
                    className={`absolute -top-2 ${mine ? '-left-2' : '-right-2'} w-5 h-5 rounded-full bg-red-500 text-white grid place-items-center shadow`}
                    title={flag?.flags?.map(f => f.note).join(', ') || 'Suspicious'}>
                    <ShieldAlert className="w-3 h-3" />
                  </button>
                )}
              </div>
              {/* hover actions */}
              {!m.is_deleted && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 self-center mx-1 transition-opacity">
                  <button onClick={() => setReplyTo(m)} className="p-1 text-gray-400 hover:text-brand-600" title="Reply"><span className="text-xs">↩</span></button>
                  {mine && <button onClick={() => { setEditing(m); setText(m.content) }} className="p-1 text-gray-400 hover:text-brand-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
                  {mine && <button onClick={() => onDelete(m)} className="p-1 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply/edit preview */}
      {(replyTo || editing) && (
        <div className="px-4 py-2 bg-white border-t text-sm flex justify-between items-center">
          <span className="text-gray-600 truncate">{editing ? `Editing: ${editing.content.slice(0, 50)}` : `Replying to: ${replyTo.content.slice(0, 50)}`}</span>
          <button onClick={() => { setReplyTo(null); setEditing(null); setText('') }} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
        </div>
      )}
      {fileWarning && (
        <div className="px-4 py-1.5 bg-orange-50 border-t text-xs text-orange-700">⚠ {fileWarning}</div>
      )}
      {file && (
        <div className="px-4 py-2 bg-white border-t text-sm flex justify-between items-center">
          <span className="text-gray-600 truncate">📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
          <button onClick={() => { setFile(null); setFileWarning('') }} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={submit} className="flex items-end gap-2 px-3 py-2 bg-white border-t">
        <input ref={fileRef} type="file" className="hidden" onChange={async e => {
          const f = e.target.files[0]
          if (!f) return
          const v = validateFile(f)
          if (!v.ok) { setFileWarning(v.issues.join('; ')); setFile(null); return }
          setFileWarning('')
          setFile(f)
          if (f.type.startsWith('image/')) {
            const qr = await analyzeImageForQR(f)
            if (qr.length) setFileWarning(`QR detected → ${qr[0].data.slice(0, 80)} (risk score ${qr[0].analysis.weight})`)
          }
        }} />
        <button type="button" onClick={() => fileRef.current.click()} className="p-2 text-gray-500 hover:text-brand-600"><Paperclip className="w-5 h-5" /></button>
        <div className="relative flex-1">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) } }}
            placeholder={editing ? 'Edit message…' : 'Type a message…'}
            className="w-full border rounded-2xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32" />
          {showEmoji && (
            <div className="absolute bottom-full mb-1 left-0 bg-white border rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1 z-10">
              {EMOJIS.map(em => <button key={em} type="button" onClick={() => setText(t => t + em)} className="text-lg hover:bg-gray-100 rounded p-1">{em}</button>)}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-gray-500 hover:text-brand-600"><Smile className="w-5 h-5" /></button>
        <button type="submit" disabled={!text.trim() && !file}
          className="p-2 bg-brand-600 text-white rounded-full hover:bg-brand-700 disabled:opacity-40">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  )
}

function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) => p.startsWith('http')
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline text-brand-300 hover:text-white">{p}</a>
    : p)
}
