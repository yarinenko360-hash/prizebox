"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type TgWebApp = {
  initData?: string;
  initDataUnsafe?: any;
  version?: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  isExpanded?: boolean;
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function pretty(obj: any) {
  try {
    return JSON.stringify(obj ?? null, null, 2);
  } catch {
    return String(obj);
  }
}

export default function TgLoginPage() {
  const [wa, setWa] = useState<TgWebApp | null>(null);
  const [status, setStatus] = useState<string>("Инициализация…");
  const [initData, setInitData] = useState<string>("");
  const [initUnsafe, setInitUnsafe] = useState<any>(null);
  const [resp, setResp] = useState<string>("— пока нет —");
  const [loading, setLoading] = useState(false);

  // 1) Подключаем официальный скрипт (иногда на iOS без него Telegram.WebApp "плавает")
  useEffect(() => {
    const id = "tg-webapp-script";
    if (document.getElementById(id)) return;

    const s = document.createElement("script");
    s.id = id;
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const readTelegram = useCallback(() => {
    const w = window.Telegram?.WebApp;
    if (!w) {
      setWa(null);
      setStatus("Telegram.WebApp: ❌ нет (не WebApp/ещё не загрузилось)");
      setInitData("");
      setInitUnsafe(null);
      return;
    }

    setWa(w);

    // Важное: иногда initData появляется не мгновенно → читаем каждый раз заново
    const id = (w.initData ?? "").trim();
    setInitData(id);
    setInitUnsafe(w.initDataUnsafe ?? null);

    const hasInit = id.length > 0;

    setStatus(
      hasInit
        ? "Telegram.WebApp: ✅ есть, initData: ✅ есть"
        : "Telegram.WebApp: ✅ есть, initData: ⚠️ пусто (Telegram не прислал подпись)"
    );

    // Часто помогает на iOS: ready() чуть позже
    try {
      setTimeout(() => {
        w.ready?.();
        w.expand?.();
      }, 120);
    } catch {
      // ignore
    }
  }, []);

  // 2) Polling: ждём появление Telegram.WebApp и/или initData
  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const tick = () => {
      if (cancelled) return;
      tries += 1;

      const w = window.Telegram?.WebApp;
      const id = (w?.initData ?? "").trim();

      // читаем всегда, но особенно пока пусто
      readTelegram();

      // Условие успеха: есть WebApp и initData не пуст
      if (w && id.length > 0) return;

      // ждём до ~5 секунд
      if (tries < 50) setTimeout(tick, 100);
    };

    // старт через маленькую задержку (Telegram иногда инжектит интерфейс после рендера)
    setTimeout(tick, 60);

    return () => {
      cancelled = true;
    };
  }, [readTelegram]);

  const infoChips = useMemo(() => {
    return {
      platform: wa?.platform ?? "—",
      version: wa?.version ?? "—",
      scheme: wa?.colorScheme ?? "—",
      expanded: String(wa?.isExpanded ?? false),
    };
  }, [wa]);

  const postLogin = useCallback(async () => {
    setLoading(true);
    setResp("— отправляю… —");
    try {
      const r = await fetch("/api/telegram/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: (window.Telegram?.WebApp?.initData ?? "").trim(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      setResp(pretty({ http: r.status, ...data }));
      if (data?.ok && data?.token) {
        localStorage.setItem("pb_token", data.token);
      }
    } catch (e: any) {
      setResp(pretty({ error: String(e?.message ?? e) }));
    } finally {
      setLoading(false);
    }
  }, []);

  const boxStyle: React.CSSProperties = {
    maxWidth: 820,
    margin: "32px auto",
    padding: 24,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
    color: "white",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: 14,
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    marginRight: 8,
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100vh", padding: "16px 12px", background: "#0b0f14" }}>
      <div style={boxStyle}>
        <h1 style={{ fontSize: 34, margin: "0 0 8px 0" }}>Telegram Login test</h1>
        <p style={{ opacity: 0.85, marginTop: 0 }}>
          Эта страница должна быть открыта <b>внутри Telegram WebApp</b>, иначе initData будет пустой.
        </p>

        <div style={{ marginTop: 12 }}>
          <div style={chipStyle}>Статус: <b>{status}</b></div>
          <div style={chipStyle}>platform: <b>{infoChips.platform}</b></div>
          <div style={chipStyle}>version: <b>{infoChips.version}</b></div>
          <div style={chipStyle}>scheme: <b>{infoChips.scheme}</b></div>
          <div style={chipStyle}>expanded: <b>{infoChips.expanded}</b></div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>initData:</div>
          <textarea
            style={{ ...inputStyle, minHeight: 86, resize: "vertical" }}
            readOnly
            value={
              wa
                ? (initData ? initData : "— пусто (Telegram не прислал initData) —")
                : "— пусто (Telegram.WebApp не найден) —"
            }
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>initDataUnsafe (диагностика):</div>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            readOnly
            value={pretty(initUnsafe)}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button style={btnStyle} onClick={readTelegram}>
            Обновить данные
          </button>

          <button style={btnStyle} onClick={postLogin} disabled={loading}>
            {loading ? "POST… " : "POST /api/telegram/login"}
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Ответ:</div>
          <textarea style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} readOnly value={resp} />
        </div>

        <p style={{ marginTop: 14, opacity: 0.75 }}>
          Если тут <b>Telegram.WebApp: ✅ есть</b>, но <b>initData: пусто</b> — значит Telegram не прислал подпись
          (обычно из-за способа запуска Mini App или кеша). Тогда лечим запуском через кнопку <b>ОТКРЫТЬ</b> у бота
          и перезаданием Main App в BotFather.
        </p>
      </div>
    </div>
  );
}