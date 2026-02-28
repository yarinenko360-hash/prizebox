// src/lib/telegram.ts
import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

function timingSafeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * ✅ Telegram WebApp initData verification (официальная схема)
 * secret_key = HMAC_SHA256(key=botToken, message="WebAppData")
 * check_hash = HMAC_SHA256(key=secret_key, message=data_check_string)
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
):
  | { ok: true; user: TelegramUser | null; auth_date: number | null }
  | { ok: false; reason: string } {
  try {
    if (!initData) return { ok: false, reason: "No initData" };

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "No hash in initData" };

    // hash исключаем из строки проверки
    params.delete("hash");

    // data_check_string: пары key=value, отсортированные по key, через \n
    const pairs: string[] = [];
    Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => pairs.push(`${k}=${v}`));

    const dataCheckString = pairs.join("\n");

    // ✅ ВАЖНО: key=botToken, message="WebAppData"
    const secretKey = crypto
      .createHmac("sha256", botToken)
      .update("WebAppData")
      .digest();

    const checkHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (!timingSafeEqualStr(checkHash, hash)) {
      return { ok: false, reason: "bad_hash" };
    }

    const userRaw = params.get("user");
    const user: TelegramUser | null = userRaw ? JSON.parse(userRaw) : null;

    const authDateStr = params.get("auth_date");
    const auth_date = authDateStr ? Number(authDateStr) : null;

    return { ok: true, user, auth_date };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "verifyTelegramInitData error" };
  }
}

/**
 * Проверка подписки на канал/чат через Bot API getChatMember
 * chatId: "@channel" или "-100..." (если приватный/без username)
 */
export async function isMemberOfChannel(args: {
  botToken: string;
  chatId: string | number;
  userId: number;
}) {
  const { botToken, chatId, userId } = args;

  const url =
    `https://api.telegram.org/bot${botToken}/getChatMember` +
    `?chat_id=${encodeURIComponent(String(chatId))}` +
    `&user_id=${encodeURIComponent(String(userId))}`;

  const r = await fetch(url, { method: "GET" });
  const j = await r.json();

  if (!j?.ok) return { ok: false as const, member: false, raw: j };

  const status: string = j.result?.status;
  const member =
    status === "member" || status === "administrator" || status === "creator";

  return { ok: true as const, member, status, raw: j };
}