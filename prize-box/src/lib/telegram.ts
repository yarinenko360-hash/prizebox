import crypto from "crypto";

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => (obj[k] = v));
  return obj;
}

export function verifyTelegramInitData(initData: string, botToken: string) {
  const data = parseInitData(initData);

  const hash = data.hash;
  if (!hash) return { ok: false as const, reason: "NO_HASH" };

  const pairs: string[] = [];
  Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${data[k]}`));

  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const ok = computedHash === hash;

  if (!ok) return { ok: false as const, reason: "BAD_HASH" };

  return { ok: true as const, data };
}

export function extractTelegramUser(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");

  if (!userRaw) return null;

  try {
    const u = JSON.parse(userRaw);

    return {
      tg_id: Number(u.id),
      username: u.username ?? null,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      photo_url: u.photo_url ?? null,
    };
  } catch {
    return null;
  }
}