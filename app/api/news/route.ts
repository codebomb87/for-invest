import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/market/news";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim() || symbol || "";
  const market = (req.nextUrl.searchParams.get("market") === "KR" ? "KR" : "US") as Market;

  if (!symbol) {
    return NextResponse.json({ error: "symbol이 필요합니다." }, { status: 400 });
  }
  try {
    const news = await getNews(symbol, name, market);
    return NextResponse.json({ news });
  } catch (e: any) {
    console.error("[news] 실패:", e?.message || e);
    return NextResponse.json({ news: [], error: e?.message || "뉴스 조회 실패" });
  }
}
