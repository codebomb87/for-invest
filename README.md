# forInvest — 한국·미국 주식 모의 투자 시뮬레이터

Yahoo Finance 실시간(지연) 시세 기반으로 한국/미국 주식을 모의 투자 연습할 수 있는 로컬 Next.js 앱입니다.
계좌·잔액·체결은 모두 모의로 처리되며, SQLite 파일에 저장됩니다.

## 실행 방법

요구사항: **Node.js 22.13 이상** (내장 SQLite 사용을 위해 필요. https://nodejs.org 에서 LTS 설치)

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속.

> 프로덕션 모드: `npm run build && npm start`

## 기능

- 시장 대시보드: 코스피·코스닥·S&P 500·나스닥·원/달러 지수 + 한국/미국 주요 종목 등락률 순위
- 즐겨찾기: ☆ 버튼으로 추가, 한국장/미국장 구분해 등락률 순위로 표시
- 종목 검색: 한국(예: 삼성전자, 005930.KS) / 미국(예: AAPL, TSLA) 주식·ETF
- 종목별 관련 뉴스: 등락 원인 참고용 (한국: Google News, 미국: Yahoo Finance, API 키 불필요)
- 시장가 매수/매도 (현재 시세로 즉시 체결)
- 모의 계좌: 초기 자금 ₩10,000,000 + $10,000 (통화별 별도 관리)
- 보유 종목 포트폴리오: 평균단가, 평가금액, 손익(₩/$ 별도)
- 거래 내역 조회, 계좌 초기화
- 시세 30초 자동 갱신

## 데이터 저장

`data/forinvest.db` (SQLite). 삭제하면 초기 상태로 리셋됩니다.

## 구조 (추후 확장 고려)

```
lib/
  types.ts             # 도메인 타입 + MarketDataProvider / Broker 인터페이스
  db.ts                # SQLite (node:sqlite) — 추후 Postgres 등으로 교체 지점
  market/yahoo.ts      # 시세 공급자 구현 (Yahoo). 증권사 API로 교체/추가 가능
  broker/simulated.ts  # 모의 브로커. 실계좌 연동 시 같은 인터페이스로 RealBroker 구현
app/api/               # search / quote / account / trade / portfolio / transactions
                       # + market-overview(지수·주요종목) / favorites(즐겨찾기)
app/page.tsx           # 대시보드 UI
```

### 확장 포인트

- **실계좌 연동**: `Broker` 인터페이스(`lib/types.ts`)를 구현하는 `RealBroker`를 만들어
  한국투자증권(KIS) OpenAPI 등에 연결하면 API/UI 변경 없이 교체 가능.
- **자동매매/전략**: `MarketDataProvider`(시세) + `Broker`(주문)를 조합해
  전략 엔진을 별도 모듈(`lib/strategy/`)로 추가하면 됨. 주문 타입(`OrderRequest.orderType`)에
  LIMIT 등 확장 여지를 미리 둠.
- **지정가/예약 주문**: `SimulatedBroker.placeOrder`에서 `orderType: "LIMIT"` 분기 추가.

## 참고

- 시세는 Yahoo Finance 기준으로 실제 거래소 대비 지연될 수 있습니다.
- 한국 주식 심볼: 코스피 `.KS`, 코스닥 `.KQ` 접미사 (예: 035720.KQ 카카오)
