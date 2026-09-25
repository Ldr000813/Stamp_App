"use client";
import { createClient } from "@supabase/supabase-js";

// Browser client using the public ANON key (used for admin login only).
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
