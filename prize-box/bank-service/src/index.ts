import "dotenv/config";
import express from "express";
import fs from "node:fs";
import { getBankClient } from "./tg.js";
import { deliverWin } from "./jobs.js";
import { supabaseAdmin } from "./supabase.js";

const app = express();
app.use(express.json());

const secret = process.env.BANK_SERVICE_SECRET || "";
const port = Number(process.env.PORT || 4007);

const sessionPath = process.env.TG_SESSION_PATH || "./session/bank.session";
const simulate =
  String(process.env.BANK_SIMULATE || "").toLowerCase() === "true";

// Lazy init Telegram
let bankClientPromise: ReturnType<typeof getBankClient> | null = null;
function ensureClient() {
  if (!bankClientPromise) bankClientPromise = getBankClient();
  return bankClientPromise;
}

function auth(req: any, res: any, next: any) {
  const got = req.headers["x-bank-secret"];
  if (!secret || got !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

/* =========================
   HEALTH
========================= */

app.get("/health", (_req, res) => {
  const tg_env =
    !!process.env.TG_API_ID &&
    !!process.env.TG_API_HASH &&
    !!process.env.TG_PHONE;

  const session_exists = fs.existsSync(sessionPath);

  res.json({
    ok: true,
    port,

    // 👇 ВРЕМЕННАЯ ОТЛАДКА
    raw_simulate: process.env.BANK_SIMULATE,

    simulate,
    tg_env,
    session_exists,
    tg_ready: tg_env && session_exists,
  });
});

/* =========================
   SIMULATION
========================= */

async function simulateDeliver(winId: string, toUserId: number) {
  const sb = supabaseAdmin();

  const { data: win, error } = await sb
    .from("wins")
    .select("id,status")
    .eq("id", winId)
    .single();

  if (error || !win) throw new Error("win not found");

  if (!["owned", "reserved", "pending"].includes(String(win.status))) {
    throw new Error(`win not deliverable, status=${win.status}`);
  }

  await sb
    .from("wins")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      tx_hash_send: `SIMULATED:${Date.now()}`,
    })
    .eq("id", winId);

  await sb.from("prize_events").insert({
    win_id: winId,
    type: "sent_simulated",
    payload: { to_user: toUserId },
  });

  return { ok: true, simulated: true };
}

/* =========================
   DELIVER
========================= */

app.post("/deliver", auth, async (req, res) => {
  try {
    const { win_id, to_user_tg_id } = req.body || {};

    if (!win_id || !to_user_tg_id) {
      return res
        .status(400)
        .json({ error: "win_id and to_user_tg_id required" });
    }

    const tg_env =
      !!process.env.TG_API_ID &&
      !!process.env.TG_API_HASH &&
      !!process.env.TG_PHONE;

    const session_exists = fs.existsSync(sessionPath);

    // ✅ Если симуляция включена и TG не готов
    if (simulate && (!tg_env || !session_exists)) {
      const out = await simulateDeliver(
        String(win_id),
        Number(to_user_tg_id)
      );
      return res.json(out);
    }

    // Если TG не готов и симуляции нет
    if (!tg_env || !session_exists) {
      return res.status(503).json({
        error: "BANK NOT CONFIGURED",
        simulate,
        tg_env,
        session_exists,
      });
    }

    // Реальная выдача
    const client = await ensureClient()!;
    const out = await deliverWin({
      client,
      winId: String(win_id),
      toUserId: Number(to_user_tg_id),
    });

    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});

/* =========================
   START
========================= */

app.listen(port, () => {
  console.log(`bank-service listening on :${port}`);
});