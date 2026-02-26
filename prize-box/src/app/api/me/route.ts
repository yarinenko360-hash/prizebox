import { NextResponse } from "next/server";
import { readSessionToken, sessionCookieName } from "../../../lib/session";

export const runtime = "nodejs";

function getCookie(cookieHeader: string, name: string) {
  // cookieHeader: "a=1; b=2"
  const parts = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const token = getCookie(cookieHeader, sessionCookieName);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "No session" },
        { status: 401 }
      );
    }

    const payload = await readSessionToken(token);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true, session: payload });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}