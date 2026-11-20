import { supabase } from '../lib/supabase'

export async function getConversations(userId) {
  const { data: memberships } = await supabase
    .from('conversation_members').select('conversation_id, last_read_at').eq('user_id', userId)
  const ids = (memberships || []).map(m => m.conversation_id)
  if (!ids.length) return []
  const { data: convs } = await supabase.from('conversations').select('*').in('id', ids)

  // Fetch members for each conv to compute display name + other participant.
  const { data: allMembers } = await supabase
    .from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids)
  const userIds = [...new Set(allMembers.map(m => m.user_id))]
  const { data: profiles } = await supabase.from('profiles')
    .select('id, username, display_name, avatar_url, is_online, last_seen').in('id', userIds)
  const pmap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

  // Last message per conv.
  const { data: lastMsgs } = await supabase.from('messages')
    .select('conversation_id, content, type, sender_id, created_at')
    .in('conversation_id', ids).order('created_at', { ascending: false }).limit(200)
  const lastMap = {}
  for (const m of lastMsgs || []) if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m

  return (convs || []).map(c => {
    const members = (allMembers || []).filter(m => m.conversation_id === c.id).map(m => pmap[m.user_id]).filter(Boolean)
    const other = members.find(m => m.id !== userId)
    const last = lastMap[c.id]
    const unread = last && (!memberships.find(mm => mm.conversation_id === c.id)?.last_read_at ||
      new Date(last.created_at) > new Date(memberships.find(mm => mm.conversation_id === c.id)?.last_read_at)) ? 1 : 0
    return {
      ...c,
      members,
      other,
      displayName: c.type === 'group' ? (c.name || 'Group') : (other?.display_name || other?.username || 'Chat'),
      avatarUrl: c.type === 'group' ? c.avatar_url : other?.avatar_url,
      isOnline: c.type === 'direct' ? !!other?.is_online : members.some(m => m.is_online),
      lastMessage: last,
      lastReadAt: memberships.find(mm => mm.conversation_id === c.id)?.last_read_at,
    }
  }).sort((a, b) => new Date(b.lastMessage?.created_at || 0) - new Date(a.lastMessage?.created_at || 0))
}

export async function getMessages(conversationId, limit = 100) {
  const { data, error } = await supabase.from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)')
    .eq('conversation_id', conversationId).eq('is_deleted', false)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

export async function sendMessage({ conversationId, senderId, content, type = 'text', replyTo = null }) {
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content, type, reply_to: replyTo })
    .select('*, sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)').single()
  if (error) throw error
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
  return data
}

export async function editMessage(messageId, content) {
  const { error } = await supabase.from('messages').update({ content, is_edited: true, updated_at: new Date().toISOString() }).eq('id', messageId)
  if (error) throw error
}
export async function deleteMessage(messageId) {
  const { error } = await supabase.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', messageId)
  if (error) throw error
}

export async function markRead(conversationId, userId) {
  await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', userId)
}

// Realtime subscription for a conversation.
export function subscribeToConversation(conversationId, onMessage, onTyping) {
  const channel = supabase.channel(`conv:${conversationId}`, { config: { broadcast: { self: false } } })
  channel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        // enrich sender
        supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', payload.new.sender_id).maybeSingle()
          .then(({ data }) => onMessage({ ...payload.new, sender: data }))
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage({ ...payload.new, sender: payload.new.sender_id ? undefined : undefined, updated: true }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_presence', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onTyping && onTyping(payload.new))
    .subscribe()
  return channel
}

export async function setTyping(conversationId, userId, isTyping) {
  await supabase.from('typing_presence').upsert({ conversation_id: conversationId, user_id: userId, is_typing: isTyping, updated_at: new Date().toISOString() })
}

export async function createGroup({ name, createdBy, memberIds }) {
  const { data: conv, error } = await supabase.from('conversations')
    .insert({ type: 'group', name, created_by: createdBy }).select().single()
  if (error) throw error
  const rows = [createdBy, ...memberIds].map(uid => ({ conversation_id: conv.id, user_id: uid, role: uid === createdBy ? 'admin' : 'member' }))
  const { error: e2 } = await supabase.from('conversation_members').insert(rows)
  if (e2) throw e2
  return conv
}

export async function getGroupMembers(conversationId) {
  const { data } = await supabase.from('conversation_members').select('user_id, role').eq('conversation_id', conversationId)
  const ids = (data || []).map(m => m.user_id)
  const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url, is_online').in('id', ids)
  return (data || []).map(m => ({ ...m, profile: profiles?.find(p => p.id === m.user_id) }))
}

export async function addGroupMember(conversationId, userId) {
  await supabase.from('conversation_members').insert({ conversation_id: conversationId, user_id: userId })
}
export async function removeGroupMember(conversationId, userId) {
  await supabase.from('conversation_members').delete().eq('conversation_id', conversationId).eq('user_id', userId)
}

// File upload to Supabase Storage.
export async function uploadAttachment(file, path) {
  const { data, error } = await supabase.storage.from('chat-files').upload(path, file, { upsert: false })
  if (error) throw error
  return data.path
}
export function attachmentUrl(path) {
  return supabase.storage.from('chat-files').getPublicUrl(path).data.publicUrl
}
