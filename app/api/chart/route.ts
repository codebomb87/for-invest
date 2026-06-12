import { NextRequest, NextResponse } from "next/server";
import { getChart, type ChartRange } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(["1d", "5d", "1mo", "6mo", "1y", "5y"]);

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1mo";
  if (!symbol) {
    return NextResponse.json({ error: "symbol이 필요합니다." }, { status: 400 });
  }
  const range = (VALID_RANGES.has(rangeParam) ? rangeParam : "1mo") as ChartRange;

  try {
    const candles = await getChart(symbol, range);
    return NextResponse.json({ candles, range });
  } catch (e: any) {
    console.error("[chart] 실패:", e?.message || e);
    return NextResponse.json({ candles: [], range, error: e?.message || "차트 조회 실패" });
  }
}
