// app/api/referral/confirm/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySupabaseJwt } from "@/lib/jwt";
import { isMemberOfChannel } from "@/lib/telegram";

type Body = { token: string; captcha_token?: string };

export async function POST(req: Request) {
  const { token, captcha_token } = (await req.json()) as Body;

  if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  if (!botToken) return NextResponse.json({ ok: false, error: "No TELEGRAM_BOT_TOKEN" }, { status: 500 });

  // 1) decode who is calling
  let userId: string;
  try {
    const v = await verifySupabaseJwt(token);
    userId = v.sub;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Bad token", details: e?.message }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // 2) get user tg_id from profiles
  const prof = await admin.from("profiles").select("tg_user_id").eq("id", userId).single();
  if (prof.error || !prof.data?.tg_user_id) {
    return NextResponse.json({ ok: false, error: "Profile has no tg_user_id" }, { status: 400 });
  }
  const tgUserId = Number(prof.data.tg_user_id);

  // 3) captcha (optional placeholder)
  const capOk = await verifyCaptchaIfNeeded(captcha_token);
  if (!capOk.ok) {
    return NextResponse.json({ ok: false, error: "Captcha failed", details: capOk.details }, { status: 403 });
  }

  // 4) load required channels
  const channels = await admin
    .from("required_channels")
    .select("channel_id, channel_username, title")
    .eq("is_active", true);

  if (channels.error) {
    return NextResponse.json({ ok: false, error: "Failed to load required channels", details: channels.error.message }, { status: 500 });
  }

  // 5) check memberships via Telegram Bot API
  const results: any[] = [];
  let allOk = true;

  for (const ch of channels.data ?? []) {
    const channelId = Number(ch.channel_id);
    const res = await isMemberOfChannel(botToken, channelId, tgUserId);
    results.push({
      channel_id: channelId,
      title: ch.title ?? null,
      username: ch.channel_username ?? null,
      ok: res.ok,
      is_member: res.is_member,
      raw: res.raw,
    });

    if (!res.ok || !res.is_member) allOk = false;

    // audit each channel
    await admin.from("channel_memberships").insert({
      user_id: userId,
      channel_id: channelId,
      is_member: !!res.is_member,
      raw: res.raw ?? {},
    });
  }

  if (!allOk) {
    return NextResponse.json({
      ok: false,
      reason: "not_subscribed",
      channels: results.map(r => ({ channel_id: r.channel_id, title: r.title, username: r.username, is_member: r.is_member })),
    }, { status: 403 });
  }

  // 6) confirm referral + grant ticket (idempotent)
  const confirmed = await admin.rpc("confirm_referral_and_grant_ticket", {
    p_referred: userId,
    p_membership_raw: { channels: results },
  });

  if (confirmed.error) {
    return NextResponse.json({ ok: false, error: "RPC failed", details: confirmed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: confirmed.data });
}

// ---- captcha placeholder (turnstile example) ----
async function verifyCaptchaIfNeeded(captchaToken?: string) {
  const provider = process.env.CAPTCHA_PROVIDER;
  const secret = process.env.CAPTCHA_SECRET;

  if (!provider || !secret) return { ok: true as const };

  if (!captchaToken) return { ok: false as const, details: "missing_captcha_token" };

  if (provider === "turnstile") {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: captchaToken }),
    });
    const j = await r.json();
    if (j?.success) return { ok: true as const };
    return { ok: false as const, details: j };
  }

  // add other providers if needed
  return { ok: true as const };
}