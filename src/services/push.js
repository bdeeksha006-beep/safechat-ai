import { supabase } from '../lib/supabase'

// Push Notification Service
// Handles service worker registration, push subscription, and notification preferences

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Register service worker
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    console.log('Service Worker registered:', registration)
    return registration
  } catch (error) {
    console.error('Service Worker registration failed:', error)
    return null
  }
}

// Check if push is supported
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Get notification permission
export async function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// Request notification permission
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return await Notification.requestPermission()
}

// Subscribe to push notifications
export async function subscribeToPush(userId) {
  if (!isPushSupported()) {
    console.warn('Push notifications not supported')
    return null
  }

  const permission = await getNotificationPermission()
  if (permission === 'denied') {
    console.warn('Notification permission denied')
    return null
  }

  if (permission === 'default') {
    const newPermission = await requestNotificationPermission()
    if (newPermission !== 'granted') {
      console.warn('Notification permission not granted')
      return null
    }
  }

  const registration = await navigator.serviceWorker.ready
  if (!registration) {
    console.error('Service Worker not ready')
    return null
  }

  // Check existing subscription
  let subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    // Update existing subscription in DB
    await saveSubscription(subscription, userId)
    return subscription
  }

  // Create new subscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    await saveSubscription(subscription, userId)
    return subscription
  } catch (error) {
    console.error('Push subscription failed:', error)
    return null
  }
}

// Save subscription to Supabase
async function saveSubscription(subscription, userId) {
  const { endpoint, keys } = subscription.toJSON()
  
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint,
    p256dh_key: keys.p256dh,
    auth_key: keys.auth,
    device_info: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    },
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })

  if (error) {
    console.error('Failed to save push subscription:', error)
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(userId) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  
  if (subscription) {
    await subscription.unsubscribe()
    
    // Remove from DB
    const { error } = await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint)
    
    if (error) {
      console.error('Failed to remove push subscription:', error)
    }
  }
}

// Get notification preferences
export async function getNotificationPreferences(userId) {
  const { data } = await supabase.from('notification_preferences')
    .select('*').eq('user_id', userId).maybeSingle()
  return data
}

// Update notification preferences
export async function updateNotificationPreferences(userId, prefs) {
  const { error } = await supabase.from('notification_preferences')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() })
  if (error) throw error
}

// Check if conversation is muted
export async function isConversationMuted(userId, conversationId) {
  const prefs = await getNotificationPreferences(userId)
  return prefs?.muted_conversations?.includes(conversationId) || false
}

// Mute/unmute conversation
export async function toggleConversationMute(userId, conversationId) {
  const prefs = await getNotificationPreferences(userId)
  if (!prefs) return
  
  const muted = prefs.muted_conversations || []
  const isMuted = muted.includes(conversationId)
  
  if (isMuted) {
    // Unmute
    await updateNotificationPreferences(userId, {
      muted_conversations: muted.filter(id => id !== conversationId),
    })
  } else {
    // Mute
    await updateNotificationPreferences(userId, {
      muted_conversations: [...muted, conversationId],
    })
  }
}

// Show local notification (for testing)
export function showLocalNotification(title, body, options = {}) {
  if (!('Notification' in window)) return
  
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      ...options,
    })
  }
}
