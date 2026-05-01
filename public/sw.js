// Minimal service worker for InnerVerse.
//
// Why this exists: modern browsers (Chrome / Edge / Android Chrome)
// require a registered service worker with a fetch handler before
// they will show the "Install app" prompt. The presence of this
// handler is what qualifies the app as installable.
//
// What it doesn't do: cache anything. The app depends on fresh
// server-rendered pages (Clerk auth state, RLS-scoped Supabase
// reads) and stale offline content would be misleading. If we add
// offline support later, this is where it goes.

self.addEventListener("install", () => {
  // Activate immediately on install rather than waiting for old SWs
  // to close. Safe because we hold no cache state.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients immediately so the install
  // criteria are met without a refresh.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through. Browser uses the network for everything; the
  // presence of this listener is the point, not its behavior.
});
