// src/app/api/telegram/login/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTelegramInitData } from "@/lib/telegram";
import { signSupabaseJwt } from "@/lib/jwt";
import crypto from "crypto";

type Body = { initData: string };

export async function POST(req: Request) {
  const { initData } = (await req.json()) as Body;

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "No TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const v = verifyTelegramInitData(initData, botToken);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: "Bad initData", reason: v.reason }, { status: 401 });
  }

  const tg = v.user as any;
  if (!tg?.id) {
    return NextResponse.json({ ok: false, error: "No Telegram user in initData" }, { status: 400 });
  }

  const tgUserId = Number(tg.id);
  const email = `tg_${tgUserId}@prizebox.local`;

  const admin = supabaseAdmin();

  // 1) Пробуем найти профиль по tg_user_id
  const existingProfile = await admin
    .from("profiles")
    .select("id, tg_user_id, username, first_name, last_name, role, ref_code")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  let userId: string | null = existingProfile.data?.id ?? null;

  // 2) Если профиля нет — создаём auth.user (триггер создаст profiles)
  if (!userId) {
    const password = crypto.randomBytes(24).toString("base64url");

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        tg_user_id: tgUserId,
      },
    });

    if (created.error || !created.data.user) {
      return NextResponse.json(
        { ok: false, error: "Failed to create user", details: created.error?.message },
        { status: 500 }
      );
    }

    userId = created.data.user.id;
  }

  // 3) Обновим профиль телеграм-полями (имя/юзернейм)
  const upd = await admin
    .from("profiles")
    .update({
      tg_user_id: tgUserId,
      username: tg.username ?? null,
      first_name: tg.first_name ?? null,
      last_name: tg.last_name ?? null,
    })
    .eq("id", userId)
    .select("id, tg_user_id, username, first_name, last_name, role, ref_code")
    .single();

  if (upd.error) {
    return NextResponse.json(
      { ok: false, error: "Failed to update profile", details: upd.error.message },
      { status: 500 }
    );
  }

  // 4) Выдаём Supabase JWT (клиент будет использовать его для RLS)
  const token = await signSupabaseJwt(userId);

  // 5) Баланс тикетов (считаем напрямую через service-role, без RLS/headers)
  const { count: availableCount, error: e1 } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "available");

  const { count: usedCount, error: e2 } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "used");

  if (e1 || e2) {
    return NextResponse.json(
      { ok: false, error: "Failed to count tickets", details: e1?.message ?? e2?.message },
      { status: 500 }
    );
  }

  const ticket_balance = { available: availableCount ?? 0, used: usedCount ?? 0 };

  // 6) Ответ
  return NextResponse.json({
    ok: true,
    token,
    profile: upd.data,
    ticket_balance,
  });
}