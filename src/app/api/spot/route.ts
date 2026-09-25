import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const token = req.nextUrl.searchParams.get("token");
  if (!id && !token) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  let query = db.from("spots").select("*");
  query = id ? query.eq("id", id) : query.eq("token", token as string);
  const { data } = await query.maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ spot: data });
}
