// Minimal service worker: makes the app installable. Network-only, no caching,
// so the live agent state is never stale.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Web Push (sent by /api/push/send): { title, body, url?, tag? } as JSON.
const ICON = "/brand/icon-192.png?v=2";

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const opts = { body: d.body || "", icon: ICON, badge: ICON, data: { url: d.url || "/" } };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || "Poof", opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const exact = wins.find((w) => w.url === url);
    if (exact) return exact.focus();
    // An open app window: bring it to the front and go to the url.
    const any = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (any) {
      await any.focus();
      if ("navigate" in any) return any.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
