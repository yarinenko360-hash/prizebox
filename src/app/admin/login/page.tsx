"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) r.replace("/admin");
    });
  }, [r]);

  async function login() {
    setStatus("Логинимся...");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) return setStatus("Ошибка: " + error.message);
    r.replace("/admin");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", color: "#fff", background: "#000", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Admin • Prize Box</h1>
      <p style={{ opacity: 0.75, marginBottom: 24 }}>Вход по email + password (быстро для MVP)</p>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={inp}
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="password"
          type="password"
          style={inp}
        />
        <button onClick={login} style={btn}>Войти</button>
        {status && <div style={{ color: "#ff5a5a" }}>{status}</div>}
      </div>
    </main>
  );
}

const inp: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #222",
  background: "#0b0b0b",
  color: "#fff",
  outline: "none",
};

const btn: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #2a2a2a",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};