import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { marketData } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

// 즐겨찾기 목록 + 현재 시세
export async function GET() {
  let rows: any[];
  try {
    rows = getDb()
      .prepare("SELECT * FROM favorites ORDER BY created_at")
      .all() as any[];
  } catch (e: any) {
    console.error("[favorites] DB 조회 실패:", e?.message || e);
    return NextResponse.json(
      { favorites: [], error: e?.message || "즐겨찾기 조회 실패" },
      { status: 500 }
    );
  }

  let quotesBySymbol: Record<string, any> = {};
  try {
    const quotes = await marketData.getQuotes(rows.map((r) => r.symbol));
    quotesBySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
  } catch (e: any) {
    console.error("[favorites] 시세 조회 실패:", e?.message || e);
  }

  const favorites = rows.map((r) => {
    const q = quotesBySymbol[r.symbol];
    return {
      symbol: r.symbol,
      name: r.name,
      market: r.market,
      currency: q?.currency ?? (r.market === "KR" ? "KRW" : "USD"),
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePercent: q?.changePercent ?? null,
    };
  });

  return NextResponse.json({ favorites });
}

// 즐겨찾기 추가
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const symbol = String(body.symbol || "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol이 필요합니다." }, { status: 400 });
  }
  const givenName = typeof body.name === "string" ? body.name.trim() : "";
  const givenMarket = body.market === "KR" || body.market === "US" ? body.market : null;

  // 시세 조회로 종목 확인 후 저장. 시세가 막혀 있어도(429 등)
  // 프론트가 보낸 이름/시장 정보가 있으면 그대로 추가한다.
  let name = givenName;
  let market = givenMarket;
  try {
    const q = await marketData.getQuote(symbol);
    name = q.name;
    market = q.market;
  } catch (e: any) {
    if (!name || !market) {
      return NextResponse.json(
        { error: e?.message || "종목 확인 실패" },
        { status: 400 }
      );
    }
  }

  getDb()
    .prepare("INSERT OR IGNORE INTO favorites (symbol, name, market) VALUES (?,?,?)")
    .run(symbol, name, market);
  return NextResponse.json({ ok: true, message: `즐겨찾기 추가: ${name}` });
}

// 즐겨찾기 삭제 (?symbol=...)
export async function DELETE(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol이 필요합니다." }, { status: 400 });
  }
  getDb().prepare("DELETE FROM favorites WHERE symbol = ?").run(symbol);
  return NextResponse.json({ ok: true });
}
