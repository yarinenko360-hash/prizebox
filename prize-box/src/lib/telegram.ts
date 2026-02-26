import crypto from "crypto";

export function verifyTelegramWebAppInitData(initData: string, botToken: string) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    // data_check_string = sorted(key=value) excluding hash
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key === "hash") return;
      pairs.push(`${key}=${value}`);
    });
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // computed_hash = HMAC_SHA256(secret_key, data_check_string) as hex
    const computed = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return computed === hash;
  } catch {
    return false;
  }
}

export function extractTelegramUserFromInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    // userRaw может быть urlencoded JSON
    const userJson = decodeURIComponent(userRaw);
    return JSON.parse(userJson);
  } catch {
    try {
      // иногда уже нормальный JSON
      return JSON.parse(userRaw);
    } catch {
      return null;
    }
  }
}