import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon);
  const { data } = await client.auth.getUser(token);
  const email = data.user?.email;
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) return null;
  return email;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data } = await db.from("events").select("*, spot:spots(id,name_ja,name_en)").order("starts_at", { ascending: true });
  return NextResponse.json({ events: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.title_ja || !b.title_en || !b.starts_at) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("events").insert({
    spot_id: b.spot_id || null,
    title_ja: b.title_ja, title_en: b.title_en,
    description_ja: b.description_ja || null, description_en: b.description_en || null,
    image_url: b.image_url || null,
    starts_at: b.starts_at, ends_at: b.ends_at || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const allowed = ["spot_id","title_ja","title_en","description_ja","description_en","image_url","starts_at","ends_at","active"];
  const update: any = {};
  for (const k of allowed) if (k in b) update[k] = b[k] === "" ? null : b[k];
  const db = supabaseAdmin();
  const { error } = await db.from("events").update(update).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
