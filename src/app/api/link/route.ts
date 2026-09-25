import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Migrate anonymous stamps to the signed-in user (called once on login).
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { anonId } = await req.json().catch(() => ({}));
  if (!token || !anonId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon);
  const { data: udata } = await client.auth.getUser(token);
  const userId = udata.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (userId === anonId) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: anonStamps } = await db.from("stamps")
    .select("campaign_id, spot_id, acquired_at").eq("participant_id", anonId);
  if (anonStamps && anonStamps.length) {
    const rows = anonStamps.map((s) => ({
      participant_id: userId, campaign_id: s.campaign_id, spot_id: s.spot_id, acquired_at: s.acquired_at,
    }));
    await db.from("stamps").upsert(rows, { onConflict: "participant_id,campaign_id,spot_id", ignoreDuplicates: true });
    await db.from("stamps").delete().eq("participant_id", anonId);
  }
  return NextResponse.json({ ok: true });
}
