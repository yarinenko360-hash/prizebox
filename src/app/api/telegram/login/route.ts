import { NextResponse } from "next/server";
import crypto from "crypto";

import { verifyTelegramInitData } from "@/lib/telegram";
import { signSupabaseJwt } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = { initData: string };

export async function POST(req: Request) {
  try {
    const { initData } = (await req.json()) as Body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    const v = verifyTelegramInitData(initData, botToken);           
    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: "No TELEGRAM_BOT_TOKEN" },
        { status: 500 }
      );
    }

    const v = verifyTelegramInitData(initData, botToken);
    if (!v.ok) {
      return NextResponse.json(
        { ok: false, error: "Bad initData", reason: v.reason },
        { status: 401 }
      );
    }

    const tg = v.user as any;
    if (!tg?.id) {
      return NextResponse.json(
        { ok: false, error: "No Telegram user in initData" },
        { status: 400 }
      );
    }

    const tgUserId = Number(tg.id);
    const email = `tg_${tgUserId}@prizebox.local`;

    const admin = supabaseAdmin();

    // 1) ищем профиль
    const existingProfile = await admin
      .from("profiles")
      .select("id, tg_user_id, username, first_name, last_name, role, ref_code")
      .eq("tg_user_id", tgUserId)
      .maybeSingle();

    let userId: string | null = existingProfile.data?.id ?? null;

    // 2) если профиля нет — создаём supabase auth user + profiles
    if (!userId) {
      const tempPass = crypto.randomBytes(16).toString("hex");

      const created = await admin.auth.admin.createUser({
        email,
        password: tempPass,
        email_confirm: true,
        user_metadata: {
          tg_user_id: tgUserId,
          username: tg.username ?? null,
          first_name: tg.first_name ?? null,
          last_name: tg.last_name ?? null,
        },
      });

      if (created.error || !created.data.user) {
        return NextResponse.json(
          { ok: false, error: "Failed to create auth user", details: created.error?.message },
          { status: 500 }
        );
      }

      userId = created.data.user.id;

      const up = await admin.from("profiles").insert({
        id: userId,
        tg_user_id: tgUserId,
        username: tg.username ?? null,
        first_name: tg.first_name ?? null,
        last_name: tg.last_name ?? null,
        role: "user",
      });

      if (up.error) {
        return NextResponse.json(
          { ok: false, error: "Failed to insert profile", details: up.error.message },
          { status: 500 }
        );
      }
    }

    // 3) выдаём JWT для supabase (под твою схему)
    const token = signSupabaseJwt({
      sub: userId!,
      email,
      role: "authenticated",
    });

    return NextResponse.json({ ok: true, token, user_id: userId, tg_user_id: tgUserId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}