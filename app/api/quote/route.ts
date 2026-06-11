import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol이 필요합니다." }, { status: 400 });
  }
  try {
    const quote = await marketData.getQuote(symbol);
    return NextResponse.json({ quote });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "시세 조회 실패" },
      { status: 500 }
    );
  }
}
