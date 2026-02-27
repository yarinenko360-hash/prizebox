// app/api/game/consume-ticket/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySupabaseJwt } from "@/lib/jwt";

type Body = { token: string; game: string; round_id: string };

export async function POST(req: Request) {
  const { token, game, round_id } = (await req.json()) as Body;

  if (!token || !game || !round_id) {
    return NextResponse.json({ ok: false, error: "token, game, round_id required" }, { status: 400 });
  }

  let userId: string;
  try {
    const v = await verifySupabaseJwt(token);
    userId = v.sub;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Bad token", details: e?.message }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const res = await admin.rpc("consume_ticket_for_game", {
    p_user: userId,
    p_game: game,
    p_round_id: round_id,
  });

  if (res.error) {
    return NextResponse.json({ ok: false, error: "RPC failed", details: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: res.data });
}