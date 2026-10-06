import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Read-only, public endpoint for the "temporary viewer" login on the owner screen.
// Returns active spots (display fields only) so a demo user can SEE the owner UI
// without any account. No write capability is exposed here.
export async function GET() {
  const db = supabaseAdmin();
  const { data } = await db.from("spots")
    .select("id, name_ja, name_en, image_url")
    .eq("active", true)
    .order("name_ja");
  return NextResponse.json({ spots: data || [] });
}
