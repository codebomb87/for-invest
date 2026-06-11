import { NextRequest, NextResponse } from "next/server";
import { broker } from "@/lib/broker/simulated";
import type { OrderRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT_ID = 1;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { symbol, side, quantity } = body;
  if (!symbol || !["BUY", "SELL"].includes(side) || !quantity) {
    return NextResponse.json(
      { error: "symbol, side(BUY/SELL), quantity가 필요합니다." },
      { status: 400 }
    );
  }

  const order: OrderRequest = {
    accountId: DEFAULT_ACCOUNT_ID,
    symbol,
    side,
    quantity: Number(quantity),
    orderType: "MARKET",
  };

  const result = await broker.placeOrder(order);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
