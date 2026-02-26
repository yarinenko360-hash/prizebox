import { NextResponse } from "next/server";
import { verifyTelegramWebAppInitData, extractTelegramUserFromInitData } from "../../../lib/telegram";
import { createSessionToken, sessionCookieName } from "../../../lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const initData = body?.initData;

    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
    }

    const isValid = verifyTelegramWebAppInitData(initData);
    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Invalid Telegram initData" }, { status: 401 });
    }

    const tgUser = extractTelegramUserFromInitData(initData);
    if (!tgUser?.id) {
      return NextResponse.json({ ok: false, error: "Telegram user not found in initData" }, { status: 400 });
    }

    // Пока без Supabase — чисто чтобы деплой НЕ падал.
    const token = await createSessionToken({
      telegramId: String(tgUser.id),
      role: "admin",
      profileId: null
    });

    const res = NextResponse.json({ ok: true, user: tgUser });

    res.cookies.set(sessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7 // 7 дней
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}