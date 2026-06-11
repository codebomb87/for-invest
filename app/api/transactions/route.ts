import { NextRequest, NextResponse } from "next/server";
import { broker } from "@/lib/broker/simulated";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT_ID = 1;

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const transactions = await broker.getTransactions(DEFAULT_ACCOUNT_ID, limit);
  return NextResponse.json({ transactions });
}
