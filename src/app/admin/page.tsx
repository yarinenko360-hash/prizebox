"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = { id: string; role: string | null; telegram_id: number | null };

export default function AdminPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Profile | null>(null);
  const [err, setErr] = useState<string>("");
  const [maintenance, setMaintenance] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        r.replace("/admin/login");
        return;
      }

      const userId = data.session.user.id;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, telegram_id")
        .eq("id", userId)
        .single();

      if (profErr) {
        setErr("Профиль не найден / нет прав: " + profErr.message);
        setLoading(false);
        return;
      }

      if (prof.role !== "admin") {
        setErr("Доступ запрещён: ты не admin (profiles.role != admin)");
        setLoading(false);
        return;
      }

      setMe(prof as any);

      // читаем текущий флаг через api
      const res = await fetch("/api/admin/flags");
      const j = await res.json().catch(() => null);
      if (j?.maintenance?.enabled !== undefined) {
        setMaintenance(!!j.maintenance.enabled);
      }

      setLoading(false);
    })();
  }, [r]);

  async function logout() {
    await supabase.auth.signOut();
    r.replace("/admin/login");
  }

  async function toggleMaintenance() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenance: { enabled: !maintenance } }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "API error");
      setMaintenance(!!j.maintenance.enabled);
    } catch (e: any) {
      setErr("Ошибка: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main style={wrap}>
        <h1 style={h1}>Admin • Prize Box</h1>
        <p style={{ opacity: 0.75 }}>Загрузка…</p>
      </main>
    );
  }

  if (err) {
    return (
      <main style={wrap}>
        <h1 style={h1}>Admin • Prize Box</h1>
        <p style={{ color: "#ff5a5a" }}>Ошибка: {err}</p>
        <button onClick={logout} style={btn}>Выйти</button>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={h1}>Admin • Prize Box</h1>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            user_id: {me?.id} • telegram_id: {me?.telegram_id ?? "—"}
          </div>
        </div>
        <button onClick={logout} style={btn}>Выйти</button>
      </div>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 18 }}>STOP GAME (maintenance)</h2>
        <p style={{ opacity: 0.75, marginTop: 6 }}>
          Если включено — игра должна показывать “технические неполадки” и не выдавать призы.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>
            Сейчас:{" "}
            <span style={{ color: maintenance ? "#ff5a5a" : "#7CFF7C" }}>
              {maintenance ? "ОСТАНОВЛЕНО" : "РАБОТАЕТ"}
            </span>
          </div>

          <button disabled={busy} onClick={toggleMaintenance} style={btn}>
            {busy ? "…" : maintenance ? "ВКЛЮЧИТЬ игру" : "ОСТАНОВИТЬ игру"}
          </button>
        </div>

        {err && <p style={{ color: "#ff5a5a" }}>{err}</p>}
      </section>
    </main>
  );
}

const wrap: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui",
  color: "#fff",
  background: "#000",
  minHeight: "100vh",
};

const h1: React.CSSProperties = { fontSize: 28, margin: "0 0 8px 0" };

const card: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid #222",
  borderRadius: 16,
  padding: 16,
  background: "#0b0b0b",
};

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #2a2a2a",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};