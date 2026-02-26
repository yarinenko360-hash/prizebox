import crypto from "crypto";

export const sessionCookieName = "pb_session";

type SessionPayload = {
  telegramId: string;
  role: string;
  profileId: string | null;
  iat: number;
  exp: number;
};

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlJson(obj: any) {
  return b64url(JSON.stringify(obj));
}

function sign(data: string, secret: string) {
  return b64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export async function createSessionToken(input: {
  telegramId: string;
  role: string;
  profileId: string | null;
}) {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);

  const payload: SessionPayload = {
    telegramId: input.telegramId,
    role: input.role,
    profileId: input.profileId,
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 дней
  };

  const header = { alg: "HS256", typ: "JWT" };

  const h = b64urlJson(header);
  const p = b64urlJson(payload);
  const data = `${h}.${p}`;
  const s = sign(data, secret);
  return `${data}.${s}`;
}

export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [h, p, s] = parts;
    const data = `${h}.${p}`;
    const expected = sign(data, secret);
    if (expected !== s) return null;

    const json = Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}