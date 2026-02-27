import crypto from "crypto";

type JwtArgsObject = {
  sub: string;
  email?: string;
  role?: "authenticated" | "anon" | "service_role";
};

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Подпись JWT для Supabase.
 * Поддерживает оба варианта:
 * 1) signSupabaseJwt({ sub, email, role })
 * 2) signSupabaseJwt(sub, email, role?)
 */
export function signSupabaseJwt(
  arg1: string | JwtArgsObject,
  email2?: string,
  role2: JwtArgsObject["role"] = "authenticated"
) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("No SUPABASE_JWT_SECRET in env");

  const { sub, email, role } =
    typeof arg1 === "string"
      ? { sub: arg1, email: email2, role: role2 }
      : { sub: arg1.sub, email: arg1.email, role: arg1.role ?? "authenticated" };

  const now = Math.floor(Date.now() / 1000);

  const payload: any = {
    aud: "authenticated",
    role: role ?? "authenticated",
    sub,
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 дней
  };
  if (email) payload.email = email;

  const header = { alg: "HS256", typ: "JWT" };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const data = `${headerPart}.${payloadPart}`;

  const signature = crypto.createHmac("sha256", secret).update(data).digest();
  const sigPart = base64url(signature);

  return `${data}.${sigPart}`;
}

/**
 * Проверка JWT (для твоих API: referral/confirm и т.п.)
 * Возвращает payload (минимум sub), если подпись ок.
 */
export async function verifySupabaseJwt(token: string) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("No SUPABASE_JWT_SECRET in env");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Bad JWT format");

  const [h, p, s] = parts;
  const data = `${h}.${p}`;

  const expected = base64url(crypto.createHmac("sha256", secret).update(data).digest());
  if (expected !== s) throw new Error("Bad JWT signature");

  const payload = JSON.parse(base64urlDecode(p));

  // простая проверка exp
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now > payload.exp) throw new Error("JWT expired");

  return payload as { sub: string; [k: string]: any };
}