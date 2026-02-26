import crypto from "crypto";

export type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

function parseInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function buildDataCheckString(data: Record<string, string>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  return pairs.join("\n");
}

/**
 * Telegram WebApp initData verification.
 * Needs TELEGRAM_BOT_TOKEN in env.
 */
export function verifyTelegramWebAppInitData(initData: string): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  const data = parseInitData(initData);
  const hash = data.hash;
  if (!hash) return false;

  const dataCheckString = buildDataCheckString(data);

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // computed_hash = HMAC_SHA256(data_check_string, secret_key)
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // timing-safe compare
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(hash, "hex")
    );
  } catch {
    return false;
  }
}

export function extractTelegramUserFromInitData(initData: string): TelegramUser {
  const data = parseInitData(initData);
  const userRaw = data.user;
  if (!userRaw) return {};

  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    return user ?? {};
  } catch {
    return {};
  }
}