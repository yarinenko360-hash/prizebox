import { NextResponse } from "next/server";
import { verifyTelegramInitData, extractTelegramUser } from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSessionToken } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const initData = body?.initData;

    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ error: "initData is required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is missing" }, { status: 500 });
    }

    const verified = verifyTelegramInitData(initData, botToken);
    if (!verified.ok) {
      return NextResponse.json(
        { error: "Telegram initData invalid", reason: verified.reason },
        { status: 401 }
      );
    }

    const tgUser = extractTelegramUser(initData);
    if (!tgUser) {
      return NextResponse.json({ error: "No user in initData" }, { status: 400 });
    }

    // find existing profile
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("tg_id", tgUser.tg_id)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    let profileId = existing?.id as string | undefined;
    let role = existing?.role ?? "user";

    if (!profileId) {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("profiles")
        .insert({
          tg_id: tgUser.tg_id,
          username: tgUser.username,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          photo_url: tgUser.photo_url,
          role: "user",
        })
        .select("id, role")
        .single();

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      profileId = created.id;
      role = created.role;
    } else {
      // update public fields (never role)
      await supabaseAdmin
        .from("profiles")
        .update({
          username: tgUser.username,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          photo_url: tgUser.photo_url,
        })
        .eq("id", profileId);
    }

    const token = await createSessionToken({
      uid: profileId!,
      tg_id: tgUser.tg_id,
      role: role ?? "user",
    });

    const res = NextResponse.json({ ok: true });

    res.cookies.set("pb_session", token, {
      httpOnly: true,
      secure: false, // локально false; на проде сделаем true
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}