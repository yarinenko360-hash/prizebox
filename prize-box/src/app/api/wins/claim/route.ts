import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// TODO: реальная отправка NFT с BANK на user_wallet
async function sendNftToUser(params: {
  nftAddress: string;
  userWallet: string;
}): Promise<{ txHash: string }> {
  /**
   * Здесь будет транзакция transfer NFT:
   * - отправитель: BANK wallet
   * - получатель: userWallet
   * - предмет: nftAddress
   */
  return { txHash: "TX_HASH_SEND_PLACEHOLDER" };
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const win_id = String(body.win_id);
    const user_wallet = String(body.user_wallet || "");

    if (!win_id || !user_wallet) {
      return NextResponse.json({ error: "win_id and user_wallet are required" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // 1) достаём win
    const { data: win, error: winErr } = await sb
      .from("wins")
      .select("id, user_tg_id, status, nft_pool_id")
      .eq("id", win_id)
      .single();

    if (winErr || !win) {
      return NextResponse.json({ error: "Win not found" }, { status: 404 });
    }

    if (win.status !== "owned") {
      return NextResponse.json(
        { error: `Win is not ready to deliver. Current status: ${win.status}` },
        { status: 409 }
      );
    }
    if (!win.nft_pool_id) {
      return NextResponse.json({ error: "No nft_pool_id attached to win" }, { status: 500 });
    }

    // 2) достаём NFT
    const { data: nft, error: nftErr } = await sb
      .from("nft_pool")
      .select("id, nft_address, status")
      .eq("id", win.nft_pool_id)
      .single();

    if (nftErr || !nft) {
      return NextResponse.json({ error: "NFT not found" }, { status: 404 });
    }
    if (nft.status !== "owned") {
      return NextResponse.json({ error: `NFT is not owned by bank. Current status: ${nft.status}` }, { status: 409 });
    }

    // 3) помечаем claim
    await sb.from("wins").update({ user_wallet, claim_requested_at: new Date().toISOString() }).eq("id", win_id);
    await sb.from("prize_events").insert({
      win_id,
      nft_pool_id: nft.id,
      type: "claim",
      payload: { user_wallet },
    });

    // 4) отправляем NFT
    let txHash = "";
    try {
      const sent = await sendNftToUser({ nftAddress: nft.nft_address, userWallet: user_wallet });
      txHash = sent.txHash;
    } catch (e: any) {
      await sb.from("wins").update({ error: `Send failed: ${String(e?.message ?? e)}` }).eq("id", win_id);
      return NextResponse.json({ error: "Не удалось отправить NFT пользователю." }, { status: 502 });
    }

    // 5) фиксируем delivered
    await sb.from("nft_pool").update({ status: "sent" }).eq("id", nft.id);
    await sb
      .from("wins")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), tx_hash_send: txHash })
      .eq("id", win_id);

    await sb.from("prize_events").insert({
      win_id,
      nft_pool_id: nft.id,
      type: "sent",
      payload: { tx_hash_send: txHash, user_wallet },
    });

    return NextResponse.json({ ok: true, win_id, status: "delivered", tx_hash_send: txHash });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}