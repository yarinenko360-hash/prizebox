"use client";

import { useEffect, useState } from "react";

export default function TgLoginPage() {
  const [initData, setInitData] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = (window as any)?.Telegram?.WebApp?.initData || "";
    setInitData(id);
  }, []);

  async function doLogin() {
    setLoading(true);
    setResult(null);

    try {
      const r = await fetch("/api/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      const j = await r.json();
      setResult(j);

      if (j?.ok && j?.token) {
        localStorage.setItem("pb_token", j.token);
      }
    } catch (e: any) {
      setResult({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 8px 0" }}>Telegram Login тест</h1>
        <div style={{ opacity: 0.8, marginBottom: 16 }}>
          Эта страница должна быть открыта <b>внутри Telegram WebApp</b>, иначе initData будет пустой.
        </div>

        <div style={{ marginBottom: 12 }}>
          <b>initData:</b>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {initData ? initData : "— пусто (ты не в Telegram WebApp) —"}
          </pre>
        </div>

        <button
          onClick={doLogin}
          disabled={!initData || loading}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: !initData || loading ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.10)",
            color: "white",
            cursor: !initData || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Логинюсь..." : "POST /api/telegram/login"}
        </button>

        <div style={{ marginTop: 16 }}>
          <b>Ответ:</b>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {result ? JSON.stringify(result, null, 2) : "— пока нет —"}
          </pre>
        </div>

        <div style={{ marginTop: 12, opacity: 0.8 }}>
          Если <b>ok:true</b> — токен сохранится в localStorage как <code>pb_token</code>.
        </div>
      </div>
    </div>
  );
}