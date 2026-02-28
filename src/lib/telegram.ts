import crypto from "crypto";

export function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData) return { ok: false as const, reason: "empty_initData" as const };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false as const, reason: "no_hash" as const };

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    return { ok: false as const, reason: "bad_hash" as const, computedHash, hash };
  }

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  return { ok: true as const, user, params: Object.fromEntries(params.entries()) };
}