// src/app/api/auth/telegram/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

type Body = { initData?: string };

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");

  // data_check_string — пары key=value, отсортированные по key, через \n
  const pairs: string[] = [];
  Array.from(params.keys())
    .sort()
    .forEach((key) => {
      const value = params.get(key);
      if (value !== null) pairs.push(`${key}=${value}`);
    });

  const dataCheckString = pairs.join("\n");
  return { params, hash, dataCheckString };
}

function verifyTelegramWebAppInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const { hash, dataCheckString } = parseInitData(initData);
  if (!hash) return false;

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // computed_hash = HMAC_SHA256(secret_key, data_check_string)
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // сравнение без утечек по времени
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(hash, "hex")
    );
  } catch {
    return false;
  }
}

function extractTelegramUserFromInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const initData = body?.initData?.trim();

    if (!initData) {
      return NextResponse.json(
        { ok: false, error: "initData is required" },
        { status: 400 }
      );
    }

    const isValid = verifyTelegramWebAppInitData(initData);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Invalid Telegram initData" },
        { status: 401 }
      );
    }

    const tgUser = extractTelegramUserFromInitData(initData);
    if (!tgUser?.id) {
      return NextResponse.json(
        { ok: false, error: "Telegram user not found in initData" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, user: tgUser });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}