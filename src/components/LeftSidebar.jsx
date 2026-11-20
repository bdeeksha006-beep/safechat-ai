import { useState } from 'react'
import { Search, UserPlus, Users, ShieldCheck, LogOut, Settings, Ban, Check, X, MessageCircle } from 'lucide-react'
import * as contacts from '../services/contacts'
import * as msg from '../services/messages'

export default function LeftSidebar({ user, profile, conversations, friends, requests, blocked, activeConv, onSelect, onRefresh, signOut }) {
  const [tab, setTab] = useState('chats') // chats | friends | requests | blocked
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState(new Set())

  async function search(q) {
    setQuery(q)
    if (q.length >= 2) setResults(await contacts.searchUsers(q, user.id))
    else setResults([])
  }

  async function addFriend(uid) {
    await contacts.sendFriendRequest(user.id, uid)
    onRefresh()
  }
  async function respond(id, accept) {
    await contacts.respondFriendRequest(id, accept)
    onRefresh()
  }
  async function unblock(uid) { await contacts.unblockUser(user.id, uid); onRefresh() }

  async function createGroup() {
    if (!groupName.trim() || !selected.size) return
    await msg.createGroup({ name: groupName.trim(), createdBy: user.id, memberIds: [...selected] })
    setShowNewGroup(false); setGroupName(''); setSelected(new Set()); onRefresh()
  }

  const incoming = requests.filter(r => r.to_user === user.id)
  const outgoing = requests.filter(r => r.from_user === user.id)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-brand-600 text-white">
        <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center font-bold">
          {(profile?.display_name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{profile?.display_name || 'User'}</div>
          <div className="text-[11px] text-brand-100">@{profile?.username}</div>
        </div>
        <button onClick={signOut} title="Log out"><LogOut className="w-4 h-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-xs">
        {[['chats', 'Chats'], ['friends', 'Friends'], ['requests', `Requests${incoming.length ? ` (${incoming.length})` : ''}`], ['blocked', 'Blocked']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 font-medium ${tab === k ? 'text-brand-700 border-b-2 border-brand-600' : 'text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
          <input value={query} onChange={e => search(e.target.value)} placeholder="Search users…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        {results.length > 0 && (
          <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-auto">
            {results.map(u => (
              <div key={u.id} className="flex items-center gap-2 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-brand-100 grid place-items-center text-brand-700 text-xs font-bold">{(u.display_name || u.username)[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{u.display_name}</div><div className="text-[11px] text-gray-400">@{u.username}</div></div>
                <button onClick={() => addFriend(u.id)} className="text-brand-600 hover:bg-brand-50 p-1.5 rounded" title="Add friend"><UserPlus className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'chats' && (
          <>
            <button onClick={() => setShowNewGroup(true)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-brand-700 hover:bg-brand-50">
              <Users className="w-4 h-4" /> New group
            </button>
            {conversations.map(c => (
              <button key={c.id} onClick={() => onSelect(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 ${activeConv?.id === c.id ? 'bg-brand-50' : ''}`}>
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold">
                    {c.type === 'group' ? <Users className="w-5 h-5" /> : (c.displayName || '?')[0].toUpperCase()}
                  </div>
                  {c.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-brand-500 border-2 border-white rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between"><span className="text-sm font-medium truncate">{c.displayName}</span>
                    <span className="text-[10px] text-gray-400">{c.lastMessage ? new Date(c.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
                  <div className="text-xs text-gray-500 truncate">{c.lastMessage ? (c.lastMessage.sender_id === user.id ? 'You: ' : '') + (c.lastMessage.content || `[${c.lastMessage.type}]`) : 'No messages yet'}</div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && <p className="px-4 py-6 text-sm text-gray-400">No conversations yet. Add friends to start chatting.</p>}
          </>
        )}

        {tab === 'friends' && friends.map(f => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer" onClick={async () => {
            try {
              const convId = await contacts.ensureConversation(user.id, f.id)
              const conv = conversations.find(c => c.id === convId)
              if (conv) {
                onSelect(conv)
                setTab('chats')
              } else {
                onRefresh()
                setTimeout(() => setTab('chats'), 500)
              }
            } catch (err) {
              console.error('Error opening chat:', err)
            }
          }}>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold">{(f.display_name || f.username)[0].toUpperCase()}</div>
              {f.is_online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-brand-500 border-2 border-white rounded-full" />}
            </div>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{f.display_name}</div><div className="text-[11px] text-gray-400">@{f.username} {f.is_online ? '· online' : ''}</div></div>
            <button onClick={(e) => { e.stopPropagation(); contacts.blockUser(user.id, f.id).then(onRefresh) }} title="Block" className="text-gray-400 hover:text-red-500 p-1"><Ban className="w-4 h-4" /></button>
          </div>
        ))}
        {tab === 'friends' && friends.length === 0 && <p className="px-4 py-6 text-sm text-gray-400">No friends yet.</p>}

        {tab === 'requests' && (
          <>
            {incoming.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold">{(r.from?.display_name || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">{r.from?.display_name}</div><div className="text-[11px] text-gray-400">@{r.from?.username}</div></div>
                <button onClick={() => respond(r.id, true)} className="text-brand-600 hover:bg-brand-50 p-1.5 rounded"><Check className="w-4 h-4" /></button>
                <button onClick={() => respond(r.id, false)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><X className="w-4 h-4" /></button>
              </div>
            ))}
            {outgoing.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                <div className="w-10 h-10 rounded-full bg-gray-200 grid place-items-center text-gray-500 font-bold">{(r.to?.display_name || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">{r.to?.display_name}</div><div className="text-[11px] text-gray-400">Request sent…</div></div>
              </div>
            ))}
            {requests.length === 0 && <p className="px-4 py-6 text-sm text-gray-400">No pending requests.</p>}
          </>
        )}

        {tab === 'blocked' && blocked.map(b => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-10 h-10 rounded-full bg-gray-200 grid place-items-center text-gray-500 font-bold">{(b.display_name || b.username)[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium">{b.display_name}</div><div className="text-[11px] text-gray-400">@{b.username}</div></div>
            <button onClick={() => unblock(b.id)} className="text-xs text-brand-600 hover:underline">Unblock</button>
          </div>
        ))}
        {tab === 'blocked' && blocked.length === 0 && <p className="px-4 py-6 text-sm text-gray-400">No blocked users.</p>}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex gap-3 text-xs">
        <a href="/safety" className="flex items-center gap-1 text-brand-700 hover:underline"><ShieldCheck className="w-3.5 h-3.5" /> Safety</a>
        <a href="/settings" className="flex items-center gap-1 text-gray-500 hover:underline"><Settings className="w-3.5 h-3.5" /> Settings</a>
      </div>

      {/* New group modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setShowNewGroup(false)}>
          <div className="bg-white rounded-xl p-5 w-80 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">New group</h3>
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="space-y-1 mb-3 max-h-48 overflow-auto">
              {friends.map(f => (
                <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(f.id)} onChange={e => {
                    const s = new Set(selected); e.target.checked ? s.add(f.id) : s.delete(f.id); setSelected(s)
                  }} />
                  <span className="text-sm">{f.display_name} <span className="text-gray-400">@{f.username}</span></span>
                </label>
              ))}
            </div>
            <button onClick={createGroup} disabled={!groupName.trim() || !selected.size}
              className="w-full bg-brand-600 text-white rounded-lg py-2 text-sm disabled:opacity-50">Create ({selected.size})</button>
          </div>
        </div>
      )}
    </div>
  )
}
