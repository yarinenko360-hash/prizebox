import crypto from "crypto";

export type SessionPayload = {
  profileId?: string | null;
  role?: string | null;
  telegramId?: string | null;
};

const COOKIE_NAME = "pb_session";

/**
 * Очень простая сессия, чтобы НЕ блокировать деплой.
 * Позже заменим на нормальную (JWT/DB).
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const body = Buffer.from(JSON.stringify({ ...payload, salt, iat: Date.now() })).toString("base64url");
  return body;
}

export async function readSessionToken(cookieValue?: string | null): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const json = Buffer.from(cookieValue, "base64url").toString("utf8");
    const data = JSON.parse(json) as any;
    return {
      profileId: data?.profileId ?? null,
      role: data?.role ?? null,
      telegramId: data?.telegramId ?? null
    };
  } catch {
    return null;
  }
}

export function sessionCookieName() {
  return COOKIE_NAME;
}