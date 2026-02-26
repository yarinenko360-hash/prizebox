import { NextResponse } from "next/server";
import { readSessionToken, sessionCookieName } from "../../lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => {
          const idx = v.indexOf("=");
          if (idx === -1) return [v, ""];
          return [v.slice(0, idx), decodeURIComponent(v.slice(idx + 1))];
        })
    );

    const token = cookies[sessionCookieName()] ?? null;
    const session = await readSessionToken(token);

    return NextResponse.json({ ok: true, session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}