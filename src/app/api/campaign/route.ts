import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  const { data: campaign } = await db
    .from("campaigns").select("*").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ campaign: null, spots: [] });

  // MVP: the active campaign includes ALL active spots.
  // (For multi-campaign later, filter by the campaign_spots join instead.)
  const { data: spots } = await db.from("spots").select("*").eq("active", true).order("name_ja");
  return NextResponse.json({ campaign, spots: spots || [] });
}
