import { NextResponse } from "next/server";
import { broker } from "@/lib/broker/simulated";
import { resetAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT_ID = 1;

export async function GET() {
  const account = await broker.getAccount(DEFAULT_ACCOUNT_ID);
  if (!account) {
    return NextResponse.json({ error: "계좌 없음" }, { status: 404 });
  }
  return NextResponse.json({ account });
}

// 계좌 초기화 (잔액/보유/내역 리셋)
export async function DELETE() {
  resetAccount(DEFAULT_ACCOUNT_ID);
  const account = await broker.getAccount(DEFAULT_ACCOUNT_ID);
  return NextResponse.json({ account, message: "계좌가 초기화되었습니다." });
}
