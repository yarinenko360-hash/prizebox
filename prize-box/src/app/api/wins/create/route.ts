import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// TODO: заменить на реальную реализацию покупки на маркетплейсе
async function buyNftFromMarketplace(params: {
  marketplace: string;
  nftAddress: string;
  expectedPriceTon?: number | null;
}): Promise<{ txHash: string }> {
  /**
   * Здесь будет код, который:
   * - проверяет листинг и актуальную цену (anti-slip)
   * - отправляет транзакцию покупки от BANK
   * - ждёт подтверждение (или хотя бы фиксирует txHash и даёт воркеру подтвердить)
   */
  // Заглушка:
  return { txHash: "TX_HASH_BUY_PLACEHOLDER" };
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user_tg_id = Number(body.user_tg_id);
    const zone_id = String(body.zone_id);

    if (!user_tg_id || !zone_id) {
      return NextResponse.json({ error: "user_tg_id and zone_id are required" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const bank_wallet = process.env.BANK_WALLET_ADDRESS!;
    if (!bank_wallet) {
      return NextResponse.json({ error: "BANK_WALLET_ADDRESS is not set" }, { status: 500 });
    }

    // 1) создать win
    const { data: win, error: winErr } = await sb
      .from("wins")
      .insert({
        user_tg_id,
        zone_id,
        status: "pending",
        bank_wallet,
      })
      .select("*")
      .single();

    if (winErr || !win) {
      return NextResponse.json({ error: winErr?.message ?? "Failed to create win" }, { status: 500 });
    }

    // 2) зарезервировать NFT атомарно
    const { data: nftId, error: resErr } = await sb.rpc("reserve_nft_for_win", {
      p_zone_id: zone_id,
      p_win_id: win.id,
    });

    if (resErr || !nftId) {
      await sb
        .from("wins")
        .update({ status: "failed", error: "No available NFT in zone" })
        .eq("id", win.id);

      return NextResponse.json(
        { error: "Нет доступных NFT в зоне (пул пуст).", win_id: win.id },
        { status: 409 }
      );
    }

    // 3) привязать nft_pool_id к win + статус reserved
    await sb.from("wins").update({ status: "reserved", nft_pool_id: nftId }).eq("id", win.id);

    // 4) получить данные NFT из пула (маркетплейс, адрес, цена)
    const { data: nft, error: nftErr } = await sb
      .from("nft_pool")
      .select("id, marketplace, nft_address, expected_price_ton")
      .eq("id", nftId)
      .single();

    if (nftErr || !nft) {
      await sb.from("wins").update({ status: "failed", error: "Reserved NFT not found" }).eq("id", win.id);
      await sb
        .from("nft_pool")
        .update({ status: "available", reserved_by_win_id: null })
        .eq("id", nftId);

      return NextResponse.json({ error: "Не нашли зарезервированный NFT." }, { status: 500 });
    }

    // 5) пометить как buying
    await sb.from("nft_pool").update({ status: "buying" }).eq("id", nftId);

    // 6) купить NFT от Банка
    let buyTxHash = "";
    try {
      const buy = await buyNftFromMarketplace({
        marketplace: nft.marketplace,
        nftAddress: nft.nft_address,
        expectedPriceTon: nft.expected_price_ton,
      });
      buyTxHash = buy.txHash;
    } catch (e: any) {
      // откат: помечаем failed, чтобы воркер/админ разобрал
      await sb.from("wins").update({ status: "failed", error: `Buy failed: ${String(e?.message ?? e)}` }).eq("id", win.id);
      await sb.from("nft_pool").update({ status: "failed" }).eq("id", nftId);

      return NextResponse.json({ error: "Покупка NFT не удалась.", win_id: win.id }, { status: 502 });
    }

    // 7) зафиксировать owned (NFT уже на Банке)
    await sb.from("nft_pool").update({ status: "owned" }).eq("id", nftId);
    await sb.from("wins").update({ status: "owned", tx_hash_buy: buyTxHash }).eq("id", win.id);

    // 8) лог события
    await sb.from("prize_events").insert({
      win_id: win.id,
      nft_pool_id: nftId,
      type: "owned",
      payload: { tx_hash_buy: buyTxHash },
    });

    return NextResponse.json({
      ok: true,
      win_id: win.id,
      zone_id,
      nft_pool_id: nftId,
      status: "owned",
      tx_hash_buy: buyTxHash,
      message: "NFT куплен и лежит на Банке. Можно выдавать по запросу.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}