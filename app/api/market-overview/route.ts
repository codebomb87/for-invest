import { NextResponse } from "next/server";
import { marketData } from "@/lib/market/yahoo";
import type { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

// 주요 지수 (표시명 매핑)
const INDICES: { symbol: string; label: string }[] = [
  { symbol: "^KS11", label: "코스피" },
  { symbol: "^KQ11", label: "코스닥" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "KRW=X", label: "원/달러" },
];

// 시가총액 상위권 주요 종목 (대시보드 표시용)
const TOP_KR = [
  "005930.KS", // 삼성전자
  "000660.KS", // SK하이닉스
  "373220.KS", // LG에너지솔루션
  "207940.KS", // 삼성바이오로직스
  "005380.KS", // 현대차
  "035420.KS", // NAVER
  "000270.KS", // 기아
  "051910.KS", // LG화학
  "035720.KS", // 카카오
  "005490.KS", // POSCO홀딩스
];
const TOP_US = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
  "META", "TSLA", "AVGO", "JPM", "BRK-B",
];

function sortByChange(quotes: Quote[]): Quote[] {
  return [...quotes].sort(
    (a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)
  );
}

export async function GET() {
  try {
    // 모든 심볼을 한 번의 Yahoo 호출로 일괄 조회 (429 방지)
    const indexSymbols = INDICES.map((i) => i.symbol);
    const all = await marketData.getQuotes([...indexSymbols, ...TOP_KR, ...TOP_US]);
    const bySymbol = new Map(all.map((q) => [q.symbol, q]));

    const indices = INDICES.map((i) => {
      const q = bySymbol.get(i.symbol);
      return q ? { ...q, name: i.label } : null;
    }).filter(Boolean);

    const pick = (symbols: string[]) =>
      symbols.map((s) => bySymbol.get(s)).filter((q): q is NonNullable<typeof q> => Boolean(q));

    return NextResponse.json({
      indices,
      topKR: sortByChange(pick(TOP_KR)),
      topUS: sortByChange(pick(TOP_US)),
    });
  } catch (e: any) {
    console.error("[market-overview] 실패:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "시장 데이터 조회 실패", indices: [], topKR: [], topUS: [] },
      { status: 500 }
    );
  }
}
