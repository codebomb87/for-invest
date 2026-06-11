import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await marketData.search(q);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "검색 실패" },
      { status: 500 }
    );
  }
}
