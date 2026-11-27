/* Alert page service worker: shows the notification a push carries. Nothing is cached or fetched.

   A push is the Declarative Web Push JSON the PC apps send (utility/module/web_push.py `notification`):
     {"web_push": 8030, "notification": {"title", "body", "navigate", "silent"}}
   iOS / iPadOS 18.4+ show that JSON themselves; older systems and other browsers deliver it here.
   https://webkit.org/blog/16535/meet-declarative-web-push/
   Every push must end in a visible notification: WebKit ends a subscription whose pushes show nothing. */
'use strict';
const ICON = '/assets/brand/bf-icon-512.png';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
    let title = '알림', body = '', silent = false, url = self.registration.scope;
    try {
        const note = event.data.json().notification || {};
        if (typeof note.title === 'string' && note.title) title = note.title.slice(0, 120);
        if (typeof note.body === 'string') body = note.body.slice(0, 1200);
        silent = note.silent === true;
        // Only this page's own address is ever opened.
        if (typeof note.navigate === 'string' && note.navigate.startsWith(self.registration.scope)) url = note.navigate;
    } catch {
        try { body = event.data ? event.data.text().slice(0, 1200) : ''; } catch { body = ''; }
    }
    event.waitUntil(self.registration.showNotification(title, { body, silent, icon: ICON, data: { url } }));
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || self.registration.scope;
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const page = open.find(client => client.url.startsWith(self.registration.scope));
        if (page) return page.focus();
        return self.clients.openWindow(url);
    })());
});
