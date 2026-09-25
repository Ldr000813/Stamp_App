import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

async function activeCampaignId(db: any): Promise<string | null> {
  const { data } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

// Admin-only: edit the active campaign's reward content.
export async function PATCH(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!isAdminEmail(email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const db = supabaseAdmin();
  const id = await activeCampaignId(db);
  if (!id) return NextResponse.json({ error: "no_campaign" }, { status: 404 });
  const allowed = ["reward_title_ja","reward_title_en","reward_body_ja","reward_body_en","reward_image_url"];
  const update: any = {};
  for (const k of allowed) if (k in b) update[k] = b[k] === "" ? null : b[k];
  const { error } = await db.from("campaigns").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
