import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// Manage the per-spot owner allowlist (spot_owners). Admin-only — owners can
// never add or remove owners. Owners authenticate later with Google using the
// email listed here.

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const email = await getAuthEmail(req);
  return isAdminEmail(email);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/owners            → all owners: [{ spot_id, email }]
// GET /api/admin/owners?spot_id=…  → owners for one spot
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const spotId = req.nextUrl.searchParams.get("spot_id");
  let q = db.from("spot_owners").select("spot_id, email, created_at").order("created_at", { ascending: true });
  if (spotId) q = q.eq("spot_id", spotId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ owners: data || [] });
}

// POST { spot_id, email } → add an owner to a spot.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const spotId = b?.spot_id;
  const email = String(b?.email || "").trim().toLowerCase();
  if (!spotId || !email) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("spot_owners")
    .upsert({ spot_id: spotId, email }, { onConflict: "spot_id,email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?spot_id=…&email=… → remove an owner from a spot.
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const spotId = req.nextUrl.searchParams.get("spot_id");
  const email = String(req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!spotId || !email) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("spot_owners").delete().eq("spot_id", spotId).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
