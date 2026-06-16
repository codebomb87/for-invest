import { NextRequest, NextResponse } from "next/server";
import { recentLogs, countLogs, logsToCsv, pruneLogs } from "@/lib/access-log";

export const dynamic = "force-dynamic";

// 관리자 토큰: Render 환경변수 ADMIN_TOKEN 로 설정.
// 미설정 시 아래 기본값이 쓰이므로 배포 후 반드시 변경할 것.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "forinvest-admin";

function authorized(req: NextRequest): boolean {
  const fromQuery = req.nextUrl.searchParams.get("token");
  const fromHeader = req.headers.get("x-admin-token");
  const auth = req.headers.get("authorization");
  const fromBearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = fromQuery || fromHeader || fromBearer;
  return !!token && token === ADMIN_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("format");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);

  // CSV 다운로드
  if (format === "csv") {
    const rows = recentLogs(Number(req.nextUrl.searchParams.get("limit") ?? 100));
    const csv = logsToCsv(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="access-logs-${stamp}.csv"`,
      },
    });
  }

  // JSON 조회
  return NextResponse.json({
    total: countLogs(),
    count: Math.min(limit, 10_000),
    logs: recentLogs(limit),
  });
}

// 수동 로그 정리 (보관 정책 즉시 적용)
export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = pruneLogs();
  return NextResponse.json({ ok: true, ...result, remaining: countLogs() });
}
