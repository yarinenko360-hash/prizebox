// src/app/api/admin/auth/telegram/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

function checkTelegramSignature(initData: string, botToken: string) {
  const data = parseInitData(initData);
  const hash = data.hash;
  if (!hash) return false;

  // build data_check_string (sorted, without hash)
  const pairs: string[] = [];
  Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${data[k]}`));
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return computedHash === hash;
}

export async function POST(req: Request) {
  try {
    const { initData } = await req.json();
    if (!initData) return NextResponse.json({ error: "No initData" }, { status: 400 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ error: "No TELEGRAM_BOT_TOKEN" }, { status: 500 });

    const ok = checkTelegramSignature(initData, botToken);
    if (!ok) return NextResponse.json({ error: "Bad Telegram signature" }, { status: 401 });

    const data = parseInitData(initData);
    const userRaw = data.user ? JSON.parse(data.user) : null;
    if (!userRaw?.id) return NextResponse.json({ error: "No user in initData" }, { status: 400 });

    const tgId = String(userRaw.id);
    const username = userRaw.username ? String(userRaw.username) : null;

    // 1) ищем профиль по telegram_id
    const admin = supabaseAdmin();

    const { data: prof, error: pErr } = await admin
      .from("profiles")
      .select("id, role, telegram_id")
      .eq("telegram_id", tgId)
      .single();

    if (pErr || !prof) {
      return NextResponse.json(
        { error: "Нет профиля с этим telegram_id. Добавь в profiles.telegram_id и role=admin" },
        { status: 403 }
      );
    }
    if (prof.role !== "admin") return NextResponse.json({ error: "Not admin" }, { status: 403 });

    // 2) выдаём magic link-like сессию: проще всего создать custom JWT нельзя,
    // поэтому делаем вариант: signInWithOtp на email не подходит.
    // Решение для MVP: используем supabase auth user уже существующий по id.
    // Если auth пользователя нет — создадим auth user через admin API (invite).
    // Дальше сделаем обмен на session через admin.generateLink + verifyOtp.

    // Берём email "tg_<id>@admin.local" (технический)
    const email = `tg_${tgId}@admin.local`;

    // create or get auth user
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { telegram_id: tgId, username },
    });

    // если уже есть — createUser может ругнуться; тогда просто продолжаем
    // генерим link для входа
    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (lErr || !linkData?.properties?.email_otp) {
      return NextResponse.json({ error: lErr?.message || "Failed to generate link" }, { status: 500 });
    }

    // verify otp to get session (server-side)
    const { data: verify, error: vErr } = await admin.auth.verifyOtp({
      email,
      token: linkData.properties.email_otp,
      type: "email",
    });

    if (vErr || !verify.session) {
      return NextResponse.json({ error: vErr?.message || "Failed to verify otp" }, { status: 500 });
    }

    // ставим cookies в ответ (supabase auth cookies)
    const res = NextResponse.json({ ok: true });

    // supabase-js сам бы поставил cookies в браузере, но мы на сервере:
    // возвращаем access/refresh и клиент сам засетает через setSession
    // (надежнее и быстрее)
    res.headers.set("Content-Type", "application/json");
    return NextResponse.json({
      ok: true,
      session: verify.session,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}