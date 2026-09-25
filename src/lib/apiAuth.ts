import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Resolve the logged-in user's email from the Bearer token (or null). */
export async function getAuthEmail(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon);
  const { data } = await client.auth.getUser(token);
  const email = data.user?.email;
  return email ? email.toLowerCase() : null;
}

export function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(e);
}

// Pure ownership decision (no DB/HTTP), so it can be unit-tested directly.
export function canManageSpotDecision(
  email: string | null,
  ownerEmail: string | null | undefined,
  admin: boolean
): boolean {
  if (admin) return true;
  if (!email || !ownerEmail) return false;
  return String(ownerEmail).toLowerCase() === email.toLowerCase();
}
