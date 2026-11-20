import { supabase } from '../lib/supabase'

export async function getMyProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', userId).select().single()
  if (error) throw error
  return data
}

export async function searchUsers(query, excludeId) {
  if (!query || query.length < 2) return []
  const cleanQuery = query.trim().toLowerCase().replace('@', '')
  
  console.log('Searching for:', cleanQuery, 'exclude:', excludeId)
  
  // Simple case-insensitive search on username only
  const { data, error } = await supabase.from('profiles')
    .select('id, username, display_name, avatar_url, is_online, last_seen')
    .ilike('username', `%${cleanQuery}%`)
    .neq('id', excludeId)
    .limit(10)
  
  console.log('Search result:', data, 'Error:', error)
  
  if (error) {
    console.error('Search error:', error)
    return []
  }
  
  return data || []
}

export async function getFriends(userId) {
  const { data } = await supabase.from('friendships').select('friend_id').eq('user_id', userId)
  const ids = (data || []).map(r => r.friend_id)
  if (!ids.length) return []
  const { data: profiles } = await supabase.from('profiles')
    .select('id, username, display_name, avatar_url, is_online, last_seen')
    .in('id', ids)
  return profiles || []
}

export async function sendFriendRequest(fromId, toId) {
  const { error } = await supabase.from('friend_requests')
    .upsert({ from_user: fromId, to_user: toId, status: 'pending' }, { onConflict: 'from_user,to_user' })
  if (error) throw error
}

export async function getFriendRequests(userId) {
  const { data } = await supabase.from('friend_requests')
    .select('*, from:profiles!friend_requests_from_user_fkey(id,username,display_name,avatar_url), to:profiles!friend_requests_to_user_fkey(id,username,display_name,avatar_url)')
    .or(`to_user.eq.${userId},from_user.eq.${userId}`)
    .eq('status', 'pending')
  return data || []
}

export async function respondFriendRequest(requestId, accept) {
  const { data: req } = await supabase.from('friend_requests').select('*').eq('id', requestId).single()
  if (!req) return
  await supabase.from('friend_requests').update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() }).eq('id', requestId)
  if (accept) {
    await supabase.from('friendships').insert([
      { user_id: req.from_user, friend_id: req.to_user },
      { user_id: req.to_user, friend_id: req.from_user },
    ])
    
    // Check if conversation already exists
    const { data: existingConv } = await supabase.from('conversation_members')
      .select('conversation_id')
      .eq('user_id', req.from_user)
      
    let conversationId = null
    for (const conv of existingConv || []) {
      const { data: members } = await supabase.from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conv.conversation_id)
      if (members?.length === 2 && members.some(m => m.user_id === req.to_user)) {
        conversationId = conv.conversation_id
        break
      }
    }
    
    // Create conversation if it doesn't exist
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase.from('conversations').insert({ 
        type: 'direct', 
        created_by: req.from_user 
      }).select().single()
      
      if (convError) {
        console.error('Conversation creation error:', convError)
        return
      }
      
      conversationId = conv.id
      
      // Add both members
      const { error: memberError } = await supabase.from('conversation_members').insert([
        { conversation_id: conversationId, user_id: req.from_user },
        { conversation_id: conversationId, user_id: req.to_user },
      ])
      
      if (memberError) {
        console.error('Member insertion error:', memberError)
      }
    }
  }
}

// New function: ensure conversation exists when clicking on friend
export async function ensureConversation(userId, friendId) {
  // Check if conversation already exists
  const { data: myConvs } = await supabase.from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
  
  for (const conv of myConvs || []) {
    const { data: members } = await supabase.from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conv.conversation_id)
    if (members?.length === 2 && members.some(m => m.user_id === friendId)) {
      return conv.conversation_id
    }
  }
  
  // Create new conversation
  const { data: conv, error: convError } = await supabase.from('conversations').insert({ 
    type: 'direct', 
    created_by: userId 
  }).select().single()
  
  if (convError) throw convError
  
  const { error: memberError } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userId },
    { conversation_id: conv.id, user_id: friendId },
  ])
  
  if (memberError) throw memberError
  
  return conv.id
}

export async function getBlocked(userId) {
  const { data } = await supabase.from('blocked_users').select('blocked_id').eq('user_id', userId)
  const ids = (data || []).map(r => r.blocked_id)
  if (!ids.length) return []
  const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids)
  return profiles || []
}

export async function blockUser(userId, blockedId) {
  await supabase.from('blocked_users').upsert({ user_id: userId, blocked_id: blockedId }, { onConflict: 'user_id,blocked_id' })
}
export async function unblockUser(userId, blockedId) {
  await supabase.from('blocked_users').delete().eq('user_id', userId).eq('blocked_id', blockedId)
}

export async function heartbeat(userId) {
  await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', userId)
}
export async function goOffline(userId) {
  await supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', userId)
}
