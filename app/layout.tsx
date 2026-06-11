import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "forInvest — 모의 투자 시뮬레이터",
  description: "한국/미국 주식 모의 투자 연습 시뮬레이터",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
