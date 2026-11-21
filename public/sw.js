// SafeChat AI Service Worker — Push Notification Handler

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const title = data.title || 'SafeChat AI'
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'safechat-notification',
      data: {
        url: data.url || '/',
        conversationId: data.conversationId,
        type: data.type,
      },
      requireInteraction: data.type === 'security_alert',
      actions: data.actions || [],
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    )
  } catch (e) {
    console.error('Push notification error:', e)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const url = data.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.postMessage({ type: 'NOTIFICATION_CLICK', data })
          return
        }
      }
      // Open new window
      return clients.openWindow(url)
    })
  )
})
