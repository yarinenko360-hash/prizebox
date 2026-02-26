import { NextResponse } from "next/server";
import { readSessionToken } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/pb_session=([^;]+)/);

    if (!match) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const token = decodeURIComponent(match[1]);
    const session = await readSessionToken(token);

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, tg_id, username, first_name, last_name, photo_url, role, created_at")
      .eq("id", session.uid)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: profile }, { status: 200 });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}