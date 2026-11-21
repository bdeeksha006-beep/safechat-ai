// Supabase Edge Function: send-push-notification
// Sends push notifications to users via Web Push API
// Requires: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT secrets

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// VAPID configuration
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@safechat.ai'

if (!vapidPublicKey || !vapidPrivateKey) {
  console.error('VAPID keys not configured')
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userIds, title, body, data, type } = await req.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'userIds array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Get push subscriptions for users
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)
      .eq('is_active', true)

    if (subError) {
      console.error('Failed to fetch subscriptions:', subError)
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get notification preferences
    const { data: preferences, error: prefError } = await supabase
      .from('notification_preferences')
      .select('*')
      .in('user_id', userIds)

    if (prefError) {
      console.error('Failed to fetch preferences:', prefError)
    }

    const prefMap = new Map(preferences?.map(p => [p.user_id, p]) || [])

    // Filter subscriptions based on preferences
    const filteredSubscriptions = subscriptions?.filter(sub => {
      const prefs = prefMap.get(sub.user_id)
      if (!prefs) return true // Default to enabled

      // Check global push enabled
      if (!prefs.push_enabled) return false

      // Check type-specific settings
      if (type === 'message' && !prefs.new_message_notifications) return false
      if (type === 'group_message' && !prefs.group_message_notifications) return false
      if (type === 'security_alert' && !prefs.security_alert_notifications) return false

      // Check muted conversations
      if (data?.conversationId && prefs.muted_conversations?.includes(data.conversationId)) {
        return false
      }

      return true
    }) || []

    // Send notifications
    const results = await Promise.allSettled(
      filteredSubscriptions.map(async (sub) => {
        const payload = JSON.stringify({
          title,
          body,
          tag: data?.tag || 'safechat-notification',
          data: {
            url: data?.url || '/',
            conversationId: data?.conversationId,
            type,
          },
        })

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh_key,
                auth: sub.auth_key,
              },
            },
            payload
          )

          // Update last_used_at
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)

          return { success: true, subscriptionId: sub.id }
        } catch (error) {
          console.error('Push notification failed:', error)
          
          // Handle expired/invalid subscriptions
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id)
          }
          
          return { success: false, error: error.message, subscriptionId: sub.id }
        }
      })
    )

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failureCount = results.filter(r => r.status === 'fulfilled' && !r.value.success).length

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      failed: failureCount,
      total: filteredSubscriptions.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Push notification error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
