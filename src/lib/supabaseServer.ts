import { createClient } from "@supabase/supabase-js";

// Force every Supabase REST read to bypass Next.js's fetch Data Cache.
// Without this, Next caches the underlying fetch() responses and API routes
// return stale data (e.g. a newly added coupon/stamp won't show up until the
// cache expires or a redeploy). `dynamic = "force-dynamic"` on the routes only
// disables route-render caching, NOT this internal fetch cache.
const noStoreFetch: typeof fetch = (input: any, init: any = {}) =>
  fetch(input, { ...init, cache: "no-store" });

// Server-only client using the SERVICE ROLE key (bypasses RLS).
// NEVER import this into a client component.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}
