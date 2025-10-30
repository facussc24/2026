/**
 * @fileoverview Service Worker for offline support and PWA functionality
 * @version 2.0.0
 */

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `gestion-2026-${CACHE_VERSION}`;

// Assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/storage.js'
];

// API routes (for future backend integration)
const API_ROUTES = [];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external requests
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached version and update cache in background
                    fetchAndUpdateCache(request);
                    return cachedResponse;
                }

                // Not in cache, fetch from network
                return fetch(request)
                    .then(response => {
                        // Cache successful responses
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(request, responseClone));
                        }
                        return response;
                    })
                    .catch(() => {
                        // Offline and not in cache - return offline page
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

/**
 * Background fetch to update cache
 * @param {Request} request
 */
function fetchAndUpdateCache(request) {
    fetch(request)
        .then(response => {
            if (response && response.status === 200) {
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(request, response));
            }
        })
        .catch(() => {
            // Silently fail - offline or network error
        });
}

/**
 * Background sync event
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(
            // Sync pending changes when back online
            self.registration.active.postMessage({
                type: 'SYNC_REQUIRED'
            })
        );
    }
});

/**
 * Message event - communication with main thread
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => {
                    // Notify main thread
                    event.ports[0].postMessage({ success: true });
                })
        );
    }
});

/**
 * Push notification event (for future use)
 */
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const title = data.title || 'Sistema de Gestión';
    const options = {
        body: data.body || 'Nueva notificación',
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Focus existing window if open
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if none found
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});
