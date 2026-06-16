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
접속 로그도 같은 DB의 `access_logs` 테이블에 저장됩니다.

## 접속 로그 / 관리자 페이지

접속한 사용자의 IP 주소·시간·User-Agent가 자동으로 기록됩니다(`app/layout.tsx`가 매 접속마다 기록).
관리자 페이지에서 최근 100건을 조회하고 CSV로 내려받을 수 있습니다.

### 관리자 토큰 설정

조회/다운로드는 토큰으로 보호됩니다. 환경변수 `ADMIN_TOKEN` 으로 지정하세요.

```bash
# 로컬: .env.local 또는 실행 전 환경변수
ADMIN_TOKEN=원하는비밀토큰 npm run dev
```

> `ADMIN_TOKEN` 미설정 시 기본값 `forinvest-admin` 이 쓰입니다. 배포 후 반드시 변경하세요.

### 사용 방법 (로컬)

1. `npm run dev` 후 http://localhost:3000 에 몇 번 접속 (로그 쌓기)
2. 관리자 페이지 접속: **http://localhost:3000/admin**
3. 토큰 입력 → **조회** → 최근 100건 표시 → **로그 다운로드(CSV)** 로 저장

직접 API를 호출할 수도 있습니다:

```bash
# 최근 100건 JSON
curl "http://localhost:3000/api/admin/logs?token=<ADMIN_TOKEN>&limit=100"

# CSV 다운로드
curl -OJ "http://localhost:3000/api/admin/logs?token=<ADMIN_TOKEN>&format=csv"

# 보관 정책 즉시 적용(오래된 로그 정리)
curl -X DELETE "http://localhost:3000/api/admin/logs?token=<ADMIN_TOKEN>"
```

토큰은 쿼리스트링(`?token=`) 대신 헤더로도 보낼 수 있습니다: `-H "x-admin-token: <ADMIN_TOKEN>"`.

### Render 배포 후 (GitHub → Render)

`git push` → Render 자동 빌드 후 발급되는 주소(예: `https://forinvest-xxxx.onrender.com`)에서 동일하게 동작합니다.

1. Render 대시보드 → 서비스 → **Environment** 에 `ADMIN_TOKEN` 추가 후 재배포
2. 관리자 페이지: **`https://forinvest-xxxx.onrender.com/admin`**
3. 로그 API 엔드포인트:
   - 조회: `https://forinvest-xxxx.onrender.com/api/admin/logs?token=<ADMIN_TOKEN>&limit=100`
   - CSV 다운로드: `https://forinvest-xxxx.onrender.com/api/admin/logs?token=<ADMIN_TOKEN>&format=csv`
   - 로그 정리: `DELETE https://forinvest-xxxx.onrender.com/api/admin/logs?token=<ADMIN_TOKEN>`

Render는 프록시 뒤에 있으므로 실제 방문자 IP는 `x-forwarded-for` 헤더에서 읽습니다(이미 처리됨).

> ⚠️ Render **무료 플랜**은 15분 미접속 시 잠들면서 SQLite가 초기화되어 로그도 사라집니다.
> 로그를 계속 보관하려면 Starter + 디스크(`DATA_DIR`) 설정이 필요합니다(`DEPLOY-RENDER-RAILWAY.md` 참고).

### 로그가 너무 쌓일 때 (보관 정책)

자동 정리가 내장되어 있습니다(`lib/access-log.ts`). 200건 기록마다 정리가 실행됩니다.

- **행 수 제한(기본)**: 최신 `ACCESS_LOG_MAX`건(기본 50,000)만 유지하고 오래된 로그부터 삭제 — 링버퍼 방식.
- **기간 제한(선택)**: `ACCESS_LOG_RETENTION_DAYS`(기본 0=무제한)를 N으로 두면 N일 지난 로그 삭제.
- **수동 정리**: 위 `DELETE /api/admin/logs` 호출 또는 관리자 페이지의 "오래된 로그 정리" 버튼.

```bash
# 예: 최대 2만건 + 90일 보관
ACCESS_LOG_MAX=20000 ACCESS_LOG_RETENTION_DAYS=90 npm start
```

더 키우려면(권장 진화 방향): ① 주기적으로 CSV 다운로드해 외부 보관 → ② 로그 테이블을 별도 DB(Postgres)로 분리 → ③ 외부 로깅 서비스(예: Logtail/CloudWatch)로 전송.

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
