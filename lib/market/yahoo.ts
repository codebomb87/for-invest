import type { MarketDataProvider, Quote, SearchResult, Market, Currency } from "@/lib/types";

// Yahoo Finance 공개 엔드포인트 기반 시세 공급자.
// - 시세: v8 chart API (크럼 불필요, v7 quote API보다 요청 제한이 훨씬 덜함)
// - 검색: v1 search API
// 한국 주식: 005930.KS(코스피) / 035720.KQ(코스닥), 미국 주식: AAPL 등.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_MS = 60_000;    // 정상 응답 캐시 60초
const BACKOFF_MS = 60_000;  // 429 시 60초간 호출 중단
const CONCURRENCY = 5;      // chart API 동시 요청 수 제한

const quoteCache = new Map<string, { quote: Quote; at: number }>();
let blockedUntil = 0;

class RateLimitError extends Error {
  constructor() {
    super("요청이 많아 잠시 제한되었습니다. 1분 후 다시 시도하세요.");
  }
}

async function yfetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 429) {
    blockedUntil = Date.now() + BACKOFF_MS;
    throw new RateLimitError();
  }
  if (!res.ok) throw new Error(`Yahoo 응답 오류 (HTTP ${res.status})`);
  return res.json();
}

function marketOf(symbol: string, exchange?: string): Market {
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KR";
  if (exchange === "KSC" || exchange === "KOE") return "KR";
  return "US";
}

function currencyOf(market: Market, currency?: string): Currency {
  if (currency === "KRW" || currency === "USD") return currency;
  return market === "KR" ? "KRW" : "USD";
}

// chart API 응답의 meta → Quote 변환
function metaToQuote(meta: any): Quote {
  const market = marketOf(meta.symbol, meta.exchangeName);
  const price: number = meta.regularMarketPrice ?? 0;
  const prev: number | null = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = prev != null ? price - prev : null;
  const changePercent = prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    market,
    currency: currencyOf(market, meta.currency),
    price,
    previousClose: prev,
    change,
    changePercent,
    marketState: null,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchChartQuote(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=1d&interval=1d`;
  const data = await yfetch(url);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.symbol) return null;
  return metaToQuote(meta);
}

export class YahooMarketDataProvider implements MarketDataProvider {
  async search(query: string): Promise<SearchResult[]> {
    if (Date.now() < blockedUntil) throw new RateLimitError();
    let data: any;
    try {
      data = await yfetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
          query
        )}&quotesCount=12&newsCount=0`
      );
    } catch (e: any) {
      console.error("[market/search] 실패:", e?.message || e);
      throw e instanceof RateLimitError
        ? e
        : new Error(`검색 실패: ${e?.message || "알 수 없는 오류"}`);
    }
    const quotes: any[] = data?.quotes ?? [];
    return quotes
      .filter((it) => it?.symbol && (it.quoteType === "EQUITY" || it.quoteType === "ETF"))
      .map((it) => {
        const market = marketOf(it.symbol, it.exchange);
        return {
          symbol: it.symbol,
          name: it.longname || it.shortname || it.symbol,
          exchange: it.exchDisp || it.exchange || "",
          market,
        };
      });
  }

  // 심볼별 chart API 호출 (동시 5개 제한). 실패 시 만료된 캐시라도 반환.
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const now = Date.now();
    const result = new Map<string, Quote>();
    const need: string[] = [];

    for (const s of symbols) {
      const c = quoteCache.get(s);
      if (c && now - c.at < CACHE_MS) result.set(s, c.quote);
      else need.push(s);
    }

    if (need.length > 0 && now >= blockedUntil) {
      for (let i = 0; i < need.length; i += CONCURRENCY) {
        if (Date.now() < blockedUntil) break; // 중간에 429 발생 시 중단
        const batch = need.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(batch.map(fetchChartQuote));
        for (let j = 0; j < settled.length; j++) {
          const r = settled[j];
          if (r.status === "fulfilled" && r.value) {
            quoteCache.set(r.value.symbol, { quote: r.value, at: Date.now() });
            result.set(r.value.symbol, r.value);
          } else if (r.status === "rejected") {
            if (r.reason instanceof RateLimitError) {
              console.error("[market/quotes] Yahoo 요청 제한(429). 60초간 캐시로 응답합니다.");
            } else {
              console.error(`[market/quotes] ${batch[j]} 실패:`, r.reason?.message || r.reason);
            }
          }
        }
      }
    }

    // 못 받아온 심볼은 만료된 캐시라도 사용 (없으면 제외)
    for (const s of symbols) {
      if (!result.has(s)) {
        const c = quoteCache.get(s);
        if (c) result.set(s, c.quote);
      }
    }

    return symbols
      .map((s) => result.get(s))
      .filter((q): q is Quote => Boolean(q));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const qs = await this.getQuotes([symbol]);
    if (!qs[0]) {
      throw new Error(
        Date.now() < blockedUntil
          ? "요청이 많아 잠시 제한되었습니다. 1분 후 다시 시도하세요."
          : `시세 조회 실패: ${symbol}`
      );
    }
    return qs[0];
  }
}

export const marketData: MarketDataProvider = new YahooMarketDataProvider();
