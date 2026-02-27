// lib/telegram.ts
import crypto from "crypto";

export function verifyTelegramInitData(initData: string, botToken: string) {
  // Telegram docs: hash = HMAC_SHA256(data_check_string, secret_key)
  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) return { ok: false as const, reason: "no_hash" };

  params.delete("hash");

  // build data_check_string sorted by key
  const pairs: string[] = [];
  Array.from(params.keys())
    .sort()
    .forEach((key) => {
      const val = params.get(key);
      if (val !== null) pairs.push(`${key}=${val}`);
    });

  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computed !== hash) return { ok: false as const, reason: "bad_hash" };

  // user is JSON string
  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  return { ok: true as const, user, params };
}

/**
 * membership check: getChatMember
 * status can be: creator/administrator/member/restricted/left/kicked
 */
export async function isMemberOfChannel(botToken: string, channelId: number, tgUserId: number) {
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${tgUserId}`;
  const r = await fetch(url, { method: "GET" });
  const j = await r.json();

  if (!j?.ok) {
    return { ok: false as const, is_member: false, raw: j };
  }

  const status: string = j.result?.status;
  const isMember = ["creator", "administrator", "member", "restricted"].includes(status);

  return { ok: true as const, is_member: isMember, raw: j };
}