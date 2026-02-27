import { TelegramClient } from "gramjs";
import { supabaseAdmin } from "./supabase.js";
import { transferGiftBySlug } from "./tg.js";

export async function deliverWin(params: {
  client: TelegramClient;
  winId: string;
  toUserId: number;
}) {
  const sb = supabaseAdmin();

  const { data: win, error } = await sb
    .from("wins")
    .select("id,status,gift_ref_type,gift_ref_value")
    .eq("id", params.winId)
    .single();

  if (error || !win) throw new Error("win not found");
  if (win.status !== "owned") throw new Error(`win not deliverable, status=${win.status}`);
  if (!win.gift_ref_type || !win.gift_ref_value) throw new Error("gift_ref is missing");

  if (win.gift_ref_type !== "slug") throw new Error(`Unsupported gift_ref_type=${win.gift_ref_type}`);

  const r: any = await transferGiftBySlug(params.client, win.gift_ref_value, params.toUserId);

  await sb
    .from("wins")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      tx_hash_send: JSON.stringify(r),
    })
    .eq("id", params.winId);

  await sb.from("prize_events").insert({
    win_id: params.winId,
    type: "sent",
    payload: { to_user: params.toUserId, slug: win.gift_ref_value },
  });

  return { ok: true };
}