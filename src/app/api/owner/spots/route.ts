import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// Spots the caller may manage. Admins get all; owners get only their own.
export async function GET(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  let q = db.from("spots").select("*").eq("active", true).order("name_ja");
  if (!isAdminEmail(email)) q = q.eq("owner_email", email);
  const { data } = await q;
  return NextResponse.json({ spots: data || [], isAdmin: isAdminEmail(email), email });
}
