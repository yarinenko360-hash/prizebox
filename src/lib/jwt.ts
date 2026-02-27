// lib/jwt.ts
import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("Missing SUPABASE_JWT_SECRET");
  return new TextEncoder().encode(secret);
}

export async function signSupabaseJwt(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 7; // 7 days

  // минимальные claims чтобы RLS auth.uid() работал
  return await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(exp)
    .setSubject(userId) // auth.uid() берёт sub
    .sign(getSecret());
}

export async function verifySupabaseJwt(token: string) {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });

  const sub = payload.sub;
  if (!sub) throw new Error("JWT has no sub");

  return {
    sub: String(sub),
    role: String(payload.role ?? ""),
    aud: payload.aud,
  };
}