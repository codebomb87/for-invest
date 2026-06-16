import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { logAccess } from "@/lib/access-log";

export const metadata: Metadata = {
  title: "forInvest — 모의 투자 시뮬레이터",
  description: "한국/미국 주식 모의 투자 연습 시뮬레이터",
};

// headers() 사용 → 동적 렌더링. 접속마다 IP 로그를 남긴다.
export const dynamic = "force-dynamic";

function clientIp(h: Headers): string {
  // Render 등 프록시 뒤에서는 실제 IP가 x-forwarded-for에 들어온다.
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const h = headers();
    logAccess({
      ip: clientIp(h),
      path: "/",
      method: "GET",
      userAgent: h.get("user-agent") || undefined,
      referer: h.get("referer") || undefined,
    });
  } catch {
    // 로깅 실패는 무시
  }

  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
