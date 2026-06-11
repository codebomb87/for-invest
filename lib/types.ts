// ─── 공통 타입 정의 ───────────────────────────────────────────────
// 추후 실계좌 연동 / 자동매매 확장을 고려해 인터페이스를 분리해 둠.

export type Currency = "KRW" | "USD";
export type Market = "KR" | "US";

export interface Quote {
  symbol: string;          // 예: "005930.KS", "AAPL"
  name: string;
  market: Market;
  currency: Currency;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null; // REGULAR, CLOSED, PRE, POST 등
  updatedAt: string;          // ISO timestamp
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  market: Market;
}

// ─── 시세 데이터 공급자 인터페이스 ─────────────────────────────────
// Yahoo 외에 추후 증권사 API(KIS, 키움 등)로 교체/추가 가능.
export interface MarketDataProvider {
  search(query: string): Promise<SearchResult[]>;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
}

// ─── 계좌/주문 도메인 ─────────────────────────────────────────────
export type OrderSide = "BUY" | "SELL";

export interface OrderRequest {
  accountId: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  // 추후 지정가/조건부 주문 확장용. 현재는 MARKET만 사용.
  orderType?: "MARKET" | "LIMIT";
  limitPrice?: number;
}

export interface OrderResult {
  ok: boolean;
  message: string;
  executedPrice?: number;
  transactionId?: number;
}

export interface Holding {
  symbol: string;
  name: string;
  market: Market;
  currency: Currency;
  quantity: number;
  avgCost: number;       // 평균 매입 단가
}

export interface HoldingWithValue extends Holding {
  currentPrice: number | null;
  marketValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
}

export interface Transaction {
  id: number;
  accountId: number;
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  price: number;
  currency: Currency;
  total: number;
  createdAt: string;
}

export interface Account {
  id: number;
  name: string;
  cashKRW: number;
  cashUSD: number;
  createdAt: string;
}

// ─── 브로커 인터페이스 ────────────────────────────────────────────
// SimulatedBroker(모의) → 추후 RealBroker(실계좌) 구현체로 교체 가능.
export interface Broker {
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  getAccount(accountId: number): Promise<Account | null>;
  getHoldings(accountId: number): Promise<Holding[]>;
  getTransactions(accountId: number, limit?: number): Promise<Transaction[]>;
}
