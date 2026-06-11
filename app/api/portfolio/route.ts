import { NextResponse } from "next/server";
import { broker } from "@/lib/broker/simulated";
import { marketData } from "@/lib/market/yahoo";
import { INITIAL_CASH } from "@/lib/db";
import type { HoldingWithValue } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT_ID = 1;

export async function GET() {
  const [account, holdings] = await Promise.all([
    broker.getAccount(DEFAULT_ACCOUNT_ID),
    broker.getHoldings(DEFAULT_ACCOUNT_ID),
  ]);
  if (!account) {
    return NextResponse.json({ error: "계좌 없음" }, { status: 404 });
  }

  let quotes: Record<string, number> = {};
  try {
    const qs = await marketData.getQuotes(holdings.map((h) => h.symbol));
    quotes = Object.fromEntries(qs.map((q) => [q.symbol, q.price]));
  } catch {
    // 시세 조회 실패 시 현재가 없이 반환
  }

  const enriched: HoldingWithValue[] = holdings.map((h) => {
    const currentPrice = quotes[h.symbol] ?? null;
    const marketValue = currentPrice != null ? currentPrice * h.quantity : null;
    const cost = h.avgCost * h.quantity;
    const profitLoss = marketValue != null ? marketValue - cost : null;
    const profitLossPercent =
      profitLoss != null && cost > 0 ? (profitLoss / cost) * 100 : null;
    return { ...h, currentPrice, marketValue, profitLoss, profitLossPercent };
  });

  // 통화별 요약
  const summary = { KRW: { invested: 0, value: 0 }, USD: { invested: 0, value: 0 } };
  for (const h of enriched) {
    const s = summary[h.currency];
    s.invested += h.avgCost * h.quantity;
    if (h.marketValue != null) s.value += h.marketValue;
  }

  return NextResponse.json({ account, holdings: enriched, summary, initial: INITIAL_CASH });
}
