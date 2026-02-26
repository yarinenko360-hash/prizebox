"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("loading...");
  const [me, setMe] = useState<any>(null);

  async function loadMe() {
    const r = await fetch("/api/me");
    const j = await r.json();
    setMe(j.user);
    setStatus(j.user ? "Залогинен ✅" : "Не залогинен ❌");
  }

  async function loginFromTelegram() {
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData;

    if (!initData) {
      setStatus("Нет initData. Открой через Telegram WebApp (не в браузере напрямую).");
      return;
    }

    setStatus("Авторизация...");
    const r = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const j = await r.json();
    if (!r.ok) {
      setStatus(`Ошибка auth: ${j?.error || r.status} (${j?.reason || ""})`);
      return;
    }

    setStatus("Ок. Загружаю профиль...");
    await loadMe();
  }

  useEffect(() => {
    loadMe();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Prize Box — auth test</h1>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80">Статус</div>
          <div className="text-lg">{status}</div>
        </div>

        <button
          onClick={loginFromTelegram}
          className="w-full rounded-xl bg-white text-black font-medium py-3 hover:opacity-90"
        >
          Login via Telegram
        </button>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm opacity-80 mb-2">/api/me</div>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(me, null, 2)}
          </pre>
        </div>

        <div className="text-xs opacity-60">
          Подсказка: в обычном браузере initData нет — это нормально.
        </div>
      </div>
    </main>
  );
}