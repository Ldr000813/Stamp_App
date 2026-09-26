// Minimal service worker: enables "Add to Home Screen" (installable PWA).
// Deliberately does NOT cache /api responses (data must stay fresh).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // never intercept API calls
  // Pass-through (network). Presence of this handler makes the app installable.
});
