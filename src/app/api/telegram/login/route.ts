// src/app/api/telegram/login/route.ts
import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { initData } = await req.json();

    if (!initData) {
      return NextResponse.json(
        { ok: false, error: "No initData" },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: "No TELEGRAM_BOT_TOKEN" },
        { status: 500 }
      );
    }

    // ✅ Проверяем подпись Telegram
    const verifyResult = verifyTelegramInitData(initData, botToken);

    if (!verifyResult.ok) {
      return NextResponse.json(
        { ok: false, error: "Bad initData", reason: verifyResult.reason },
        { status: 401 }
      );
    }

    const tgUser = verifyResult.user;
    if (!tgUser?.id) {
      return NextResponse.json(
        { ok: false, error: "No Telegram user" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // upsert профиль
    await admin.from("profiles").upsert({
      id: tgUser.id.toString(),
      tg_user_id: tgUser.id,
      username: tgUser.username ?? null,
      first_name: tgUser.first_name ?? null,
      last_name: tgUser.last_name ?? null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      user: tgUser,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}