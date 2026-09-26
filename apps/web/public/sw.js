// Minimal service worker: makes the app installable. Network-only, no caching,
// so the live agent state is never stale.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
