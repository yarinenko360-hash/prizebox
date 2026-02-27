"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Phase =
  | "idle"
  | "moving"
  | "dropping"
  | "lifting"
  | "carrying"
  | "releasing"
  | "result";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function safeEncode(s: string) {
  return encodeURIComponent(s);
}

export default function PlayPage() {
  // ВРЕМЕННО: локальные балансы (потом подключим bank-service + Telegram Stars)
  const [tickets, setTickets] = useState<number>(3);
  const [stars, setStars] = useState<number>(190);

  const TICKET_COST = 30;

  const [msg, setMsg] = useState<string>(
    "Нажми START — крюк начнёт двигаться. Нажми START ещё раз — он остановится и опустится."
  );

  // Реф-код (пока локальный)
  const [refCode, setRefCode] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Canvas размеры
  const W = 360;
  const H = 520;

  // Стекло
  const glassLeft = 22;
  const glassRight = W - 22;

  const minX = glassLeft + 22;
  const maxX = glassRight - 22;

  // Выходной бокс (левый нижний)
  const outputBox = useMemo(
    () => ({
      x: 24,
      y: H - 66,
      w: 92,
      h: 34,
      cx: 70,
      cy: H - 49,
    }),
    [H]
  );

  // Игрушки
  const toys = useRef(
    [
      { id: "toy-1", x: W * 0.33, y: H - 145, r: 16 },
      { id: "toy-2", x: W * 0.55, y: H - 135, r: 18 },
      { id: "toy-3", x: W * 0.72, y: H - 155, r: 20, top: true },
    ]
  );

  // Крюк
  const claw = useRef({
    x: W / 2,
    y: 90,
    baseY: 90,
    vx: 5.2, // умеренная скорость
    dir: 1 as 1 | -1,
  });

  // PNG крюка (опционально)
  const sprites = useRef<{
    open?: HTMLImageElement;
    closed?: HTMLImageElement;
    ready: boolean;
  }>({ ready: false });

  // Визуальное состояние крюка (открыт/закрыт)
  const clawVisual = useRef({
    state: "closed" as "open" | "closed",
    closeHoldFrames: 0,
  });

  // Машина игры
  const game = useRef({
    phase: "idle" as Phase,
    selectedToyIndex: -1,
    grabbed: false,

    dropTargetY: H - 165,
    dropSpeed: 7.8,
    liftSpeed: 9.0,
    carrySpeed: 7.6,

    releaseTimer: 0,
    resultTimer: 0,
  });

  // “честность” игры (настройка)
  const rules = useMemo(() => {
    return {
      alignTolerance: 14, // насколько точно нужно попасть по центру
      chance: 0.75, // шанс захвата при попадании
    };
  }, []);

  // ---------- init ref code ----------
  useEffect(() => {
    // В идеале здесь будет TG user id из auth.
    // Пока: генерим постоянный refCode и кладём в localStorage.
    const key = "prizebox_ref_code";
    let code = "";
    try {
      code = localStorage.getItem(key) || "";
      if (!code) {
        code = `u_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, code);
      }
    } catch {
      // если localStorage недоступен
      code = `u_${Math.random().toString(36).slice(2, 10)}`;
    }
    setRefCode(code);
  }, []);

  // ---------- загрузка PNG (если положите в /public) ----------
  useEffect(() => {
    const openImg = new Image();
    const closedImg = new Image();

    let openLoaded = false;
    let closedLoaded = false;

    const mark = () => {
      sprites.current.open = openImg;
      sprites.current.closed = closedImg;
      sprites.current.ready = openLoaded && closedLoaded;
    };

    openImg.onload = () => {
      openLoaded = true;
      mark();
    };
    closedImg.onload = () => {
      closedLoaded = true;
      mark();
    };

    openImg.src = "/claw-open.png";
    closedImg.src = "/claw-closed.png";
  }, []);

  // ---------- Invite friend ----------
  function getReferralLink() {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://example.com";
    return `${origin}/play?ref=${safeEncode(refCode || "u_demo")}`;
  }

  async function inviteFriend() {
    if (game.current.phase !== "idle") {
      setMsg("Лучше приглашать друга, когда попытка не идёт 🙂");
      return;
    }

    const link = getReferralLink();

    // 1) пытаемся скопировать
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }

    // 2) если это Telegram WebApp — откроем шаринг
    const tg = (window as any)?.Telegram?.WebApp;
    const shareUrl = `https://t.me/share/url?url=${safeEncode(
      link
    )}&text=${safeEncode("Залетай в Prize Box 🎁")}`;

    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
        setMsg(copied ? "Ссылка скопирована ✅ Открылся шэринг Telegram." : "Открылся шэринг Telegram.");
        return;
      }
    } catch {
      // ignore
    }

    // 3) если не Telegram — просто откроем share в новой вкладке (или скажем про копирование)
    try {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
      setMsg(copied ? "Ссылка скопирована ✅ Открылся шэринг." : "Открылся шэринг.");
    } catch {
      setMsg(copied ? "Ссылка скопирована ✅" : `Скопируй ссылку: ${link}`);
    }
  }

  // ---------- действия ----------
  function startMovement() {
    if (game.current.phase !== "idle") return;

    if (tickets <= 0) {
      setMsg(`Билетов нет. Купи за ${TICKET_COST}⭐️ или пригласи друга 👇`);
      return;
    }

    setTickets((t) => t - 1);

    game.current.phase = "moving";
    clawVisual.current.state = "closed";
    setMsg("Крюк в движении. Жми START ещё раз в нужный момент!");
  }

  function stopAndDrop() {
    if (game.current.phase !== "moving") return;

    clawVisual.current.state = "open"; // при STOP открываем

    // ближайшая игрушка по X
    const cx = claw.current.x;
    let bestIdx = 0;
    let bestDx = Infinity;

    toys.current.forEach((t, idx) => {
      const dx = Math.abs(cx - t.x);
      if (dx < bestDx) {
        bestDx = dx;
        bestIdx = idx;
      }
    });

    game.current.selectedToyIndex = bestIdx;
    game.current.dropTargetY = toys.current[bestIdx].y - 18;
    game.current.phase = "dropping";

    setMsg("СТОП! Опускаемся…");
  }

  function onStartButton() {
    if (game.current.phase === "idle") return startMovement();
    if (game.current.phase === "moving") return stopAndDrop();
    setMsg("Подожди завершения попытки 🙂");
  }

  function buyTicketWithStars() {
    if (game.current.phase !== "idle") {
      setMsg("Покупку лучше делать когда попытка не идёт 🙂");
      return;
    }
    if (stars < TICKET_COST) {
      setMsg("Не хватает ⭐️. Пополни звёзды и возвращайся 😄");
      return;
    }
    setStars((s) => s - TICKET_COST);
    setTickets((t) => t + 1);
    setMsg(`Готово ✅ +1 билет за ${TICKET_COST}⭐️`);
  }

  // Тест-пополнение (потом уберём)
  function topUpStarsTest() {
    setStars((s) => s + 300);
    setMsg("Тест: ⭐️ пополнены. Позже подключим реальную оплату Telegram Stars.");
  }

  // ---------- core logic ----------
  function evaluateGrab() {
    const idx = game.current.selectedToyIndex;
    const toy = toys.current[idx];
    const dx = Math.abs(claw.current.x - toy.x);

    if (dx > rules.alignTolerance) {
      game.current.grabbed = false;
      return;
    }
    game.current.grabbed = Math.random() < rules.chance;
  }

  function removeToyIfGrabbed() {
    if (!game.current.grabbed) return;
    const idx = game.current.selectedToyIndex;
    toys.current[idx] = { ...toys.current[idx], y: H + 200 };
  }

  function resetToIdle(text?: string) {
    game.current.phase = "idle";
    game.current.selectedToyIndex = -1;
    game.current.grabbed = false;
    game.current.releaseTimer = 0;
    game.current.resultTimer = 0;
    claw.current.y = claw.current.baseY;

    clawVisual.current.state = "closed";
    clawVisual.current.closeHoldFrames = 0;

    if (text) setMsg(text);
  }

  function drawClaw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    // трос
    ctx.beginPath();
    ctx.moveTo(cx, 34);
    ctx.lineTo(cx, cy);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const useSprites = sprites.current.ready && sprites.current.open && sprites.current.closed;

    if (useSprites) {
      const img =
        clawVisual.current.state === "open" ? sprites.current.open! : sprites.current.closed!;
      const size = 58;
      const x = cx - size / 2;
      const y = cy - size / 2;
      ctx.drawImage(img, x, y, size, size);
      return;
    }

    // fallback
    const closed = clawVisual.current.state === "closed";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, cx - 16, cy - 10, 32, 22, 8);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;

    const spread = closed ? 6 : 14;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 8);
    ctx.lineTo(cx - spread - 12, cy + 26);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 10, cy + 8);
    ctx.lineTo(cx + spread + 12, cy + 26);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
  }

  // ---------- animation loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      // движение X
      if (game.current.phase === "moving") {
        claw.current.x += claw.current.vx * claw.current.dir;
        if (claw.current.x >= maxX) {
          claw.current.x = maxX;
          claw.current.dir = -1;
        } else if (claw.current.x <= minX) {
          claw.current.x = minX;
          claw.current.dir = 1;
        }
      }

      // держим закрытым после “схвата”
      if (clawVisual.current.closeHoldFrames > 0) {
        clawVisual.current.closeHoldFrames -= 1;
        clawVisual.current.state = "closed";
      }

      // фазы
      switch (game.current.phase) {
        case "dropping": {
          claw.current.y += game.current.dropSpeed;
          if (claw.current.y >= game.current.dropTargetY) {
            claw.current.y = game.current.dropTargetY;

            // момент захвата
            clawVisual.current.state = "closed";
            clawVisual.current.closeHoldFrames = 18;

            evaluateGrab();
            game.current.phase = "lifting";
            setMsg(game.current.grabbed ? "Есть контакт! Поднимаем…" : "Мимо. Поднимаем…");
          }
          break;
        }
        case "lifting": {
          claw.current.y -= game.current.liftSpeed;
          if (claw.current.y <= claw.current.baseY) {
            claw.current.y = claw.current.baseY;

            if (game.current.grabbed) {
              removeToyIfGrabbed();
              game.current.phase = "carrying";
              setMsg("Несём NFT в OUTPUT…");
            } else {
              clawVisual.current.state = "open";
              game.current.phase = "result";
              game.current.resultTimer = 90;
              setMsg("Промах 😅 Нажми START, чтобы начать новую попытку.");
            }
          }
          break;
        }
        case "carrying": {
          const dx = outputBox.cx - claw.current.x;
          const step = clamp(dx, -game.current.carrySpeed, game.current.carrySpeed);
          claw.current.x += step;

          if (Math.abs(dx) <= 2) {
            claw.current.x = outputBox.cx;
            game.current.phase = "releasing";
            game.current.releaseTimer = 38;
            setMsg("Скидываем 🎁");
          }
          break;
        }
        case "releasing": {
          game.current.releaseTimer -= 1;
          if (game.current.releaseTimer <= 0) {
            clawVisual.current.state = "open";
            game.current.phase = "result";
            game.current.resultTimer = 110;
            setMsg("Выигрыш: NFT ✅");
          }
          break;
        }
        case "result": {
          game.current.resultTimer -= 1;
          if (game.current.resultTimer <= 0) {
            resetToIdle("Нажми START — крюк начнёт движение.");
          }
          break;
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);

      // рамка
      roundRect(ctx, 12, 12, W - 24, H - 24, 18);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.stroke();

      // стекло
      roundRect(ctx, 22, 22, W - 44, H - 110, 16);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();

      // панель
      roundRect(ctx, 22, H - 78, W - 44, 46, 16);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fill();

      // подпись
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("PRIZE BOX", 34, H - 50);

      // output
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      roundRect(ctx, outputBox.x, outputBox.y, outputBox.w, outputBox.h, 12);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "500 12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("OUTPUT", outputBox.x + 22, outputBox.y + 22);

      // игрушки
      toys.current.forEach((t) => {
        if (t.y > H) return;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = t.top ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.85)";
        ctx.fill();

        if (t.top) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto";
          ctx.fillText("TOP", t.x - 12, t.y + 4);
        }
      });

      // крюк
      drawClaw(ctx, claw.current.x, claw.current.y);

      // статус
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "400 12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(`PHASE: ${game.current.phase.toUpperCase()}`, 34, 48);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [H, W, outputBox, rules]);

  // клавиши START
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onStartButton();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, stars]);

  const isIdle = game.current.phase === "idle";
  const isMoving = game.current.phase === "moving";

  return (
    <div className="min-h-[100vh] w-full bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* TOP BAR */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">Prize Box</div>
          <div className="flex items-center gap-3 text-sm opacity-90">
            <div>
              🎟️ <span className="font-semibold">{tickets}</span>
            </div>
            <div>
              ⭐️ <span className="font-semibold">{stars}</span>
            </div>
          </div>
        </div>

        {/* RULES (как ты просила — только рефералка и больше ничего) */}
        <div className="mb-3 text-xs opacity-70 leading-relaxed">
          <div>
            Рефералка: <span className="font-semibold">пригласи друга — получи 1 билет 🎟️</span>
          </div>
        </div>

        <div className="rounded-2xl p-3 bg-white/5 border border-white/10 shadow-lg">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl border border-white/10 bg-white/3"
            style={{ aspectRatio: `${W}/${H}` }}
          />

          <div className="mt-3 text-sm leading-snug opacity-90">{msg}</div>

          {/* BUTTONS */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={onStartButton}
              className="rounded-xl px-4 py-3 bg-white/15 hover:bg-white/20 border border-white/15 active:scale-[0.99] transition"
              title={isIdle ? "Запустить движение" : isMoving ? "Остановить и опустить" : "Идёт попытка"}
            >
              {isIdle ? "START" : isMoving ? "STOP" : "…"}
            </button>

            <button
              onClick={buyTicketWithStars}
              disabled={!isIdle}
              className={
                "rounded-xl px-4 py-3 border transition active:scale-[0.99] " +
                (!isIdle
                  ? "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/15 border-white/10")
              }
              title={`Купить 1 билет за ${TICKET_COST}⭐️`}
            >
              +1 🎟️ ({TICKET_COST}⭐️)
            </button>

            <div className="flex flex-col">
              <button
                onClick={inviteFriend}
                disabled={!isIdle}
                className={
                  "rounded-xl px-4 py-3 border transition active:scale-[0.99] " +
                  (!isIdle
                    ? "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
                    : "bg-white/10 hover:bg-white/15 border-white/10")
                }
                title="Скопировать ссылку и поделиться"
              >
                Пригласить
              </button>
              <div className="mt-1 text-[11px] opacity-60 text-center">
                Пригласи 1 друга
              </div>
            </div>
          </div>

          {/* TEST TOP UP (потом заменим на Telegram Stars) */}
          <div className="mt-3">
            <button
              onClick={topUpStarsTest}
              className="w-full rounded-xl px-4 py-3 bg-white/8 hover:bg-white/12 border border-white/10 active:scale-[0.99] transition text-sm opacity-90"
              title="Тестовая кнопка. Потом заменим на реальную оплату Telegram Stars."
            >
              +300 ⭐️ (тест-пополнение)
            </button>
          </div>

          <div className="mt-3 text-xs opacity-60">
            PNG крюка: <span className="font-semibold">/public/claw-open.png</span> и{" "}
            <span className="font-semibold">/public/claw-closed.png</span>.
          </div>

          <div className="mt-2 text-[11px] opacity-50">
            Ref: <span className="font-mono">{refCode || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}