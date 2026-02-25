// src/lib/requireAdmin.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "./supabaseAdmin";

export async function requireAdmin() {
  const cookieStore = await cookies();

  const supa = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // В Route Handler это ок. В Server Component — тоже ок, если не в strict mode.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // если Next запретит set в некоторых контекстах — не падаем
          }
        },
      },
    }
  );

  const { data: authData, error: authErr } = await supa.auth.getUser();
  if (authErr || !authData?.user) return { ok: false as const, reason: "no_auth" as const };

  const admin = supabaseAdmin();

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .single();

  if (profErr || !profile) return { ok: false as const, reason: "no_profile" as const };
  if (profile.role !== "admin") return { ok: false as const, reason: "not_admin" as const };

  return { ok: true as const, userId: authData.user.id };
}