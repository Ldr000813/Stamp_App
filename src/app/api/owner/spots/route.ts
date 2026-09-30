import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";
import { ownedSpotIds } from "@/lib/ownerAccess";

export const dynamic = "force-dynamic";

// Spots the caller may manage. Admins get all; owners get the spots whose
// allowlist (spot_owners) contains their email.
export async function GET(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const ids = await ownedSpotIds(db, email); // null = admin (all)
  let q = db.from("spots").select("*").eq("active", true).order("name_ja");
  if (ids !== null) {
    if (ids.length === 0) return NextResponse.json({ spots: [], isAdmin: false, email });
    q = q.in("id", ids);
  }
  const { data } = await q;
  return NextResponse.json({ spots: data || [], isAdmin: isAdminEmail(email), email });
}
