// src/app/api/referral/confirm/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySupabaseJwt } from "@/lib/jwt";
import { isMemberOfChannel } from "@/lib/telegram";

export const runtime = "nodejs";

type Body = { token: string; captcha_token?: string };

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as Body;

    if (!token) {
      return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: "No TELEGRAM_BOT_TOKEN" },
        { status: 500 }
      );
    }

    // 1) Verify Supabase JWT
    let userId: string;
    try {
      const jwt = await verifySupabaseJwt(token);
      userId = jwt.sub;
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: "Bad token", details: err?.message },
        { status: 401 }
      );
    }

    const admin = supabaseAdmin();

    // 2) Get tg_user_id from profiles
    const prof = await admin
      .from("profiles")
      .select("tg_user_id")
      .eq("id", userId)
      .single();

    if (prof.error || !prof.data?.tg_user_id) {
      return NextResponse.json(
        { ok: false, error: "Profile has no tg_user_id" },
        { status: 400 }
      );
    }

    const tgUserId = Number(prof.data.tg_user_id);

    // 3) Load required channels
    const channels = await admin
      .from("required_channels")
      .select("channel_id, channel_username, title")
      .eq("is_active", true);

    if (channels.error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load required channels",
          details: channels.error.message,
        },
        { status: 500 }
      );
    }

    const results: any[] = [];
    let allOk = true;

    // 4) Check membership
    for (const ch of channels.data ?? []) {
      const channelId = ch.channel_id;

      const res = await isMemberOfChannel({
        botToken,
        chatId: channelId,
        userId: tgUserId,
      });

      results.push({
        channel_id: channelId,
        title: ch.title ?? null,
        username: ch.channel_username ?? null,
        ok: res.ok,
        is_member: res.member,
        raw: res.raw,
      });

      if (!res.ok || !res.member) allOk = false;

      // optional audit
      await admin.from("channel_memberships").insert({
        user_id: userId,
        channel_id: channelId,
        is_member: !!res.member,
        raw: res.raw ?? {},
      });
    }

    if (!allOk) {
      return NextResponse.json(
        {
          ok: false,
          reason: "not_subscribed",
          channels: results.map((r) => ({
            channel_id: r.channel_id,
            title: r.title,
            username: r.username,
            is_member: r.is_member,
          })),
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, message: "All channels confirmed" });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}