import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import * as contacts from '../services/contacts'
import * as msg from '../services/messages'
import { scheduleAnalysis, getCachedAnalysis, loadStoredAnalysis } from '../safety/engine'
import { aggregateConversation } from '../safety/rules'
import { registerServiceWorker } from '../services/push'
import SafetySidebar from '../components/SafetySidebar'
import ChatWindow from '../components/ChatWindow'
import LeftSidebar from '../components/LeftSidebar'
import { ShieldCheck, Menu, X } from 'lucide-react'

export default function ChatPage() {
  const { user, profile, signOut } = useAuth()
  const [conversations, setConversations] = useState([])
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [blocked, setBlocked] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [mobileView, setMobileView] = useState('list') // list | chat | safety
  const channelRef = useRef(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    if (!user) return
    contacts.heartbeat(user.id)
    const onVis = () => document.visibilityState === 'visible' ? contacts.heartbeat(user.id) : contacts.goOffline(user.id)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', () => contacts.goOffline(user.id))
    // Register service worker for push notifications
    registerServiceWorker()
    refresh()
    const t = setInterval(refresh, 30000)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); contacts.goOffline(user.id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function refresh() {
    if (!user) return
    const [convs, fr, reqs, blk] = await Promise.all([
      msg.getConversations(user.id), contacts.getFriends(user.id),
      contacts.getFriendRequests(user.id), contacts.getBlocked(user.id),
    ])
    setConversations(convs); setFriends(fr); setRequests(reqs); setBlocked(blk)
  }

  useEffect(() => {
    if (!activeConv || !user) { setMessages([]); setAnalysis(null); return }
    let alive = true
    msg.getMessages(activeConv.id).then(m => { if (alive) setMessages(m) })
    msg.markRead(activeConv.id, user.id).then(refresh)
    loadStoredAnalysis(activeConv.id).then(r => { if (alive && r) setAnalysis(r) })

    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = msg.subscribeToConversation(
      activeConv.id,
      (m) => {
        setMessages(prev => {
          const exists = prev.find(x => x.id === m.id)
          if (exists) return prev.map(x => x.id === m.id ? { ...x, ...m } : x)
          return [...prev, m]
        })
        if (m.sender_id !== user.id) { msg.markRead(activeConv.id, user.id).then(refresh); scheduleAnalysis(activeConv.id, [...messagesRef.current, m], { userId: user.id, onResult: setAnalysis }, 2000) }
      },
      () => {}
    )
    channelRef.current = channel

    // Polling fallback in case Realtime publication isn't enabled.
    const poll = setInterval(() => {
      msg.getMessages(activeConv.id).then(m => { if (alive) setMessages(m) }).catch(() => {})
    }, 5000)

    return () => { alive = false; clearInterval(poll); if (channelRef.current) supabase.removeChannel(channelRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv?.id, user])

  // Rule-engine analysis on every message change (instant, local).
  useEffect(() => {
    if (!activeConv || !messages.length) return
    const ruleResult = aggregateConversation(messages.map(m => ({ id: m.id, text: m.content, sender_id: m.sender_id })))
    setAnalysis(prev => (prev && prev.aiAvailable) ? prev : ruleResult)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeConv?.id])

  async function handleSend(content, type = 'text', replyTo = null, file = null) {
    if (!activeConv || !user) return
    const m = await msg.sendMessage({ conversationId: activeConv.id, senderId: user.id, content, type, replyTo })
    setMessages(prev => [...prev, m])
    if (file) await attachFile(m.id, file)
    scheduleAnalysis(activeConv.id, [...messagesRef.current, m], { userId: user.id, onResult: setAnalysis }, 1500)
    refresh()
  }

  async function attachFile(messageId, file) {
    const path = `${messageId}/${Date.now()}_${file.name}`
    const storagePath = await msg.uploadAttachment(file, path)
    await supabase.from('message_attachments').insert({
      message_id: messageId, file_name: file.name,
      file_type: file.type, file_size: file.size, storage_path: storagePath,
    })
  }

  async function handleEdit(m, content) {
    await msg.editMessage(m.id, content)
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, content, is_edited: true } : x))
  }
  async function handleDelete(m) {
    await msg.deleteMessage(m.id)
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, is_deleted: true, content: '' } : x))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="md:hidden flex items-center justify-between bg-white border-b px-4 py-2">
        <button onClick={() => setMobileView(mobileView === 'list' ? 'chat' : 'list')}>
          {mobileView === 'list' ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
        <span className="font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-brand-600" /> SafeChat AI</span>
        <Link to="/safety"><ShieldCheck className="w-5 h-5 text-brand-600" /></Link>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-80 flex-col bg-white border-r min-h-0`}>
          <LeftSidebar
            user={user} profile={profile} conversations={conversations} friends={friends}
            requests={requests} blocked={blocked} activeConv={activeConv}
            onSelect={(c) => { setActiveConv(c); setMobileView('chat') }}
            onRefresh={refresh} signOut={signOut}
          />
        </div>

        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 bg-gray-50`}>
          {activeConv ? (
            <ChatWindow
              conversation={activeConv} messages={messages} user={user}
              analysis={analysis} onSend={handleSend} onEdit={handleEdit} onDelete={handleDelete}
              onOpenSafety={() => setMobileView('safety')}
            />
          ) : (
            <div className="flex-1 grid place-items-center text-gray-400">
              <div className="text-center">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-brand-300" />
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>

        <div className={`${mobileView === 'safety' ? 'flex' : 'hidden'} md:flex w-full md:w-80 flex-col bg-white border-l min-h-0`}>
          <SafetySidebar conversation={activeConv} analysis={analysis} messages={messages} user={user} onClose={() => setMobileView('chat')} />
        </div>
      </div>
    </div>
  )
}
