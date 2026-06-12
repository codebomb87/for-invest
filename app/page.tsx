"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  Wallet,
  Trophy,
  Search,
  Star,
  PieChart,
  History,
  Newspaper,
} from "lucide-react";
import CandleChart, { type Candle, type ChartType } from "./components/CandleChart";

const CHART_RANGES = [
  ["1d", "1일"],
  ["5d", "1주"],
  ["1mo", "1개월"],
  ["6mo", "6개월"],
  ["1y", "1년"],
  ["5y", "5년"],
] as const;
type ChartRange = (typeof CHART_RANGES)[number][0];

type Quote = {
  symbol: string;
  name: string;
  market: "KR" | "US";
  currency: "KRW" | "USD";
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null;
};

type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  market: "KR" | "US";
};

type Holding = {
  symbol: string;
  name: string;
  market: "KR" | "US";
  currency: "KRW" | "USD";
  quantity: number;
  avgCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
};

type Account = { id: number; name: string; cashKRW: number; cashUSD: number };

type CurrencySummary = { invested: number; value: number };
type Summary = { KRW: CurrencySummary; USD: CurrencySummary };
type Initial = { KRW: number; USD: number };

type TopSort = "changeDesc" | "changeAsc" | "price" | "name";
type HoldSort = "plPct" | "value" | "name";

type Tx = {
  id: number;
  symbol: string;
  name: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  currency: "KRW" | "USD";
  total: number;
  createdAt: string;
};

type NewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
};

type Favorite = {
  symbol: string;
  name: string;
  market: "KR" | "US";
  currency: "KRW" | "USD";
  price: number | null;
  change: number | null;
  changePercent: number | null;
};

function fmt(n: number | null | undefined, currency?: string) {
  if (n == null) return "-";
  const digits = currency === "KRW" ? 0 : 2;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function cur(c: "KRW" | "USD") {
  return c === "KRW" ? "₩" : "$";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function ChangeText({ change, percent }: { change: number | null; percent: number | null }) {
  if (change == null || percent == null) return <span className="muted">-</span>;
  const cls = change > 0 ? "up" : change < 0 ? "down" : "muted";
  const sign = change > 0 ? "▲" : change < 0 ? "▼" : "";
  return (
    <span className={cls}>
      {sign} {fmt(Math.abs(change))} ({percent.toFixed(2)}%)
    </span>
  );
}

export default function Home() {
  const [account, setAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [topSort, setTopSort] = useState<TopSort>("changeDesc");
  const [holdSort, setHoldSort] = useState<HoldSort>("plPct");

  const [indices, setIndices] = useState<Quote[]>([]);
  const [topKR, setTopKR] = useState<Quote[]>([]);
  const [topUS, setTopUS] = useState<Quote[]>([]);
  const [topTab, setTopTab] = useState<"KR" | "US">("KR");
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("1mo");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [showMA, setShowMA] = useState(true);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPortfolio = useCallback(async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/transactions"),
      ]);
      const p = await pRes.json();
      const t = await tRes.json();
      if (p.account) setAccount(p.account);
      if (p.holdings) setHoldings(p.holdings);
      if (p.summary) setSummary(p.summary);
      if (p.initial) setInitial(p.initial);
      if (t.transactions) setTxs(t.transactions);
    } catch {
      /* 네트워크 오류 무시 */
    }
  }, []);

  const refreshMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market-overview");
      const data = await res.json();
      if (res.ok) {
        setIndices(data.indices ?? []);
        setTopKR(data.topKR ?? []);
        setTopUS(data.topUS ?? []);
        setOverviewError(null);
      } else {
        setOverviewError(data.error || "시장 데이터를 불러오지 못했습니다.");
      }
    } catch {
      setOverviewError("시장 데이터를 불러오지 못했습니다. 네트워크를 확인하세요.");
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites");
      const data = await res.json();
      if (data.favorites) setFavorites(data.favorites);
    } catch {
      /* 무시 */
    }
  }, []);

  const refreshAll = useCallback(() => {
    refreshPortfolio();
    refreshMarket();
    refreshFavorites();
    setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
  }, [refreshPortfolio, refreshMarket, refreshFavorites]);

  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 60_000); // 60초마다 갱신 (Yahoo 요청 제한 방지)
    return () => clearInterval(id);
  }, [refreshAll]);

  // 검색 (디바운스)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchError(null);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (res.ok) {
          setResults(data.results ?? []);
          if ((data.results ?? []).length === 0) {
            setSearchError("검색 결과가 없습니다.");
          }
        } else {
          setResults([]);
          setSearchError(data.error || "검색에 실패했습니다. 잠시 후 다시 시도하세요.");
        }
      } catch {
        setResults([]);
        setSearchError("검색에 실패했습니다. 네트워크를 확인하세요.");
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  async function selectSymbol(symbol: string) {
    setMsg(null);
    setQuote(null);
    setNews([]);
    setCandles([]);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (res.ok && data.quote) {
        setQuote(data.quote);
        loadNews(data.quote);
        loadChart(symbol, chartRange);
      } else {
        setMsg({ ok: false, text: data.error || "시세 조회 실패" });
      }
    } catch {
      setMsg({ ok: false, text: "시세 조회에 실패했습니다. 네트워크를 확인하세요." });
    }
  }

  async function loadChart(symbol: string, range: ChartRange) {
    setChartLoading(true);
    try {
      const res = await fetch(
        `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`
      );
      const data = await res.json();
      setCandles(data.candles ?? []);
    } catch {
      setCandles([]);
    } finally {
      setChartLoading(false);
    }
  }

  function changeRange(range: ChartRange) {
    setChartRange(range);
    if (quote) loadChart(quote.symbol, range);
  }

  async function loadNews(q: Quote) {
    setNewsLoading(true);
    try {
      const res = await fetch(
        `/api/news?symbol=${encodeURIComponent(q.symbol)}&name=${encodeURIComponent(q.name)}&market=${q.market}`
      );
      const data = await res.json();
      setNews(data.news ?? []);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  }

  async function trade(side: "BUY" | "SELL") {
    if (!quote || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: quote.symbol, side, quantity: qty }),
      });
      const data = await res.json();
      setMsg({ ok: res.ok, text: data.message || data.error || "처리됨" });
      if (res.ok) await refreshPortfolio();
    } catch {
      setMsg({ ok: false, text: "주문 처리 중 오류가 발생했습니다." });
    } finally {
      setBusy(false);
    }
  }

  const isFav = useCallback(
    (symbol: string) => favorites.some((f) => f.symbol === symbol),
    [favorites]
  );

  async function toggleFavorite(symbol: string, name?: string, market?: "KR" | "US") {
    try {
      if (isFav(symbol)) {
        await fetch(`/api/favorites?symbol=${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, name, market }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setMsg({ ok: false, text: data.error || "즐겨찾기 추가에 실패했습니다." });
          return;
        }
      }
      await refreshFavorites();
    } catch {
      setMsg({ ok: false, text: "즐겨찾기 처리 중 오류가 발생했습니다." });
    }
  }

  async function resetAccount() {
    if (!confirm("계좌를 초기화할까요? 보유 종목과 거래 내역이 모두 삭제됩니다.")) return;
    await fetch("/api/account", { method: "DELETE" });
    setMsg(null);
    await refreshPortfolio();
  }

  const estimated = quote ? quote.price * qty : 0;

  const topListRaw = topTab === "KR" ? topKR : topUS;
  const topList = [...topListRaw].sort((a, b) => {
    switch (topSort) {
      case "changeAsc":
        return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
      case "price":
        return b.price - a.price;
      case "name":
        return a.name.localeCompare(b.name, "ko");
      default:
        return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
    }
  });

  const sortedHoldings = [...holdings].sort((a, b) => {
    switch (holdSort) {
      case "value":
        return (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity);
      case "name":
        return a.name.localeCompare(b.name, "ko");
      default:
        return (b.profitLossPercent ?? -Infinity) - (a.profitLossPercent ?? -Infinity);
    }
  });

  // 통화별 전체 손익 = (현금 + 주식 평가금액) - 초기 자금 (실현 손익 포함)
  function totalRow(currency: "KRW" | "USD") {
    if (!account || !initial) return null;
    const cash = currency === "KRW" ? account.cashKRW : account.cashUSD;
    const value = summary?.[currency]?.value ?? 0;
    const total = cash + value;
    const pl = total - initial[currency];
    const plPct = (pl / initial[currency]) * 100;
    return { cash, value, total, pl, plPct };
  }
  const krwRow = totalRow("KRW");
  const usdRow = totalRow("USD");

  // 현재 선택 종목을 보유 중이면 차트에 평균단가선 표시
  const myHolding = quote ? holdings.find((h) => h.symbol === quote.symbol) : undefined;
  const favKR = favorites
    .filter((f) => f.market === "KR")
    .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
  const favUS = favorites
    .filter((f) => f.market === "US")
    .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));

  function FavGroup({ title, items }: { title: string; items: Favorite[] }) {
    if (items.length === 0) return null;
    return (
      <>
        <div className="fav-group-title">{title}</div>
        <table>
          <tbody>
            {items.map((f, i) => (
              <tr key={f.symbol} className="clickable" onClick={() => selectSymbol(f.symbol)}>
                <td>
                  <span className="rank">{i + 1}</span>
                  {f.name}
                  <div className="small">{f.symbol}</div>
                </td>
                <td>{f.price != null ? `${cur(f.currency)}${fmt(f.price, f.currency)}` : "-"}</td>
                <td>
                  <ChangeText change={f.change} percent={f.changePercent} />
                </td>
                <td style={{ width: 30 }}>
                  <button
                    className="star-btn on"
                    title="즐겨찾기 해제"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(f.symbol);
                    }}
                  >
                    <Star size={15} fill="currentColor" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <div className="container">
      <header className="topbar">
        <h1><TrendingUp size={20} /> forInvest</h1>
        <span className="sub">한국 · 미국 주식 모의 투자 시뮬레이터</span>
        {lastUpdated && (
          <span className="sub" style={{ marginLeft: "auto" }}>
            60초마다 자동 갱신 · 마지막 {lastUpdated}
          </span>
        )}
      </header>

      {/* 지수 스트립 */}
      <div className="index-strip">
        {indices.length === 0 ? (
          <div className="index-card">
            <div className="label">시장 지수</div>
            <div className="value muted">{overviewError ? "조회 실패" : "불러오는 중…"}</div>
          </div>
        ) : (
          indices.map((ix) => (
            <div className="index-card" key={ix.symbol}>
              <div className="label">{ix.name}</div>
              <div className="value">{fmt(ix.price)}</div>
              <div className="chg">
                <ChangeText change={ix.change} percent={ix.changePercent} />
              </div>
            </div>
          ))
        )}
      </div>
      {overviewError && <div className="msg err" style={{ marginBottom: 16 }}>{overviewError}</div>}

      {/* 계좌 요약 */}
      <div className="panel full" style={{ marginBottom: 16 }}>
        <div className="row-head">
          <h2><Wallet size={15} /> 모의 계좌</h2>
          <button className="ghost" onClick={resetAccount}>계좌 초기화</button>
        </div>
        <div className="cash-row">
          <div className="cash-item">
            <div className="label">원화 총자산 (현금 + 주식)</div>
            <div className="value">{krwRow ? `₩${fmt(krwRow.total, "KRW")}` : "…"}</div>
            {krwRow && (
              <div className="sub-line">
                현금 ₩{fmt(krwRow.cash, "KRW")} · 주식 ₩{fmt(krwRow.value, "KRW")}
              </div>
            )}
          </div>
          <div className="cash-item">
            <div className="label">원화 전체 손익</div>
            <div className={`value ${krwRow ? (krwRow.pl > 0 ? "up" : krwRow.pl < 0 ? "down" : "") : ""}`}>
              {krwRow
                ? `${krwRow.pl > 0 ? "+" : ""}₩${fmt(krwRow.pl, "KRW")} (${krwRow.plPct.toFixed(2)}%)`
                : "…"}
            </div>
            <div className="sub-line">초기 자금 ₩{initial ? fmt(initial.KRW, "KRW") : "-"} 대비</div>
          </div>
          <div className="cash-item">
            <div className="label">달러 총자산 (현금 + 주식)</div>
            <div className="value">{usdRow ? `$${fmt(usdRow.total, "USD")}` : "…"}</div>
            {usdRow && (
              <div className="sub-line">
                현금 ${fmt(usdRow.cash, "USD")} · 주식 ${fmt(usdRow.value, "USD")}
              </div>
            )}
          </div>
          <div className="cash-item">
            <div className="label">달러 전체 손익</div>
            <div className={`value ${usdRow ? (usdRow.pl > 0 ? "up" : usdRow.pl < 0 ? "down" : "") : ""}`}>
              {usdRow
                ? `${usdRow.pl > 0 ? "+" : ""}$${fmt(usdRow.pl, "USD")} (${usdRow.plPct.toFixed(2)}%)`
                : "…"}
            </div>
            <div className="sub-line">초기 자금 ${initial ? fmt(initial.USD, "USD") : "-"} 대비</div>
          </div>
        </div>
      </div>

      <div className="grid">
        {/* 주요 종목 */}
        <div className="panel">
          <div className="row-head">
            <h2><Trophy size={15} /> 주요 종목</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="tabs">
                <button className={topTab === "KR" ? "active" : ""} onClick={() => setTopTab("KR")}>한국</button>
                <button className={topTab === "US" ? "active" : ""} onClick={() => setTopTab("US")}>미국</button>
              </div>
              <select
                className="sort-select"
                value={topSort}
                onChange={(e) => setTopSort(e.target.value as TopSort)}
              >
                <option value="changeDesc">등락률 ↑</option>
                <option value="changeAsc">등락률 ↓</option>
                <option value="price">가격순</option>
                <option value="name">이름순</option>
              </select>
            </div>
          </div>
          {topList.length === 0 ? (
            <div className="empty">{overviewError ? "시장 데이터를 불러오지 못했습니다." : "불러오는 중…"}</div>
          ) : (
            <table>
              <tbody>
                {topList.map((q, i) => (
                  <tr key={q.symbol} className="clickable" onClick={() => selectSymbol(q.symbol)}>
                    <td>
                      <span className="rank">{i + 1}</span>
                      {q.name}
                      <div className="small">{q.symbol}</div>
                    </td>
                    <td>{cur(q.currency)}{fmt(q.price, q.currency)}</td>
                    <td><ChangeText change={q.change} percent={q.changePercent} /></td>
                    <td style={{ width: 30 }}>
                      <button
                        className={`star-btn ${isFav(q.symbol) ? "on" : ""}`}
                        title={isFav(q.symbol) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(q.symbol, q.name, q.market); }}
                      >
                        <Star size={15} fill={isFav(q.symbol) ? "currentColor" : "none"} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 종목 검색 + 주문 */}
        <div className="panel">
          <h2><Search size={15} /> 종목 검색 / 주문</h2>
          <div className="search-row">
            <input
              placeholder="종목명 또는 심볼 (예: 삼성전자, AAPL, 005930.KS)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {searching && <div className="muted">검색 중…</div>}
          {!searching && searchError && <div className="msg err">{searchError}</div>}
          <div className="results">
            {results.map((r) => (
              <div key={r.symbol} className="result-item" onClick={() => selectSymbol(r.symbol)}>
                <div>
                  <div>{r.name}</div>
                  <div className="sym">{r.symbol} · {r.exchange}</div>
                </div>
                <span className={`badge ${r.market}`}>{r.market === "KR" ? "한국" : "미국"}</span>
              </div>
            ))}
          </div>

          {quote && (
            <div className="quote-box">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="name">
                  {quote.name}
                  <button
                    className={`star-btn ${isFav(quote.symbol) ? "on" : ""}`}
                    title={isFav(quote.symbol) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    onClick={() => toggleFavorite(quote.symbol, quote.name, quote.market)}
                  >
                    <Star size={15} fill={isFav(quote.symbol) ? "currentColor" : "none"} />
                  </button>
                </span>
                <span className={`badge ${quote.market}`}>{quote.symbol}</span>
              </div>
              <div className="price">
                {cur(quote.currency)}{fmt(quote.price, quote.currency)}
              </div>
              <div className="chg">
                <ChangeText change={quote.change} percent={quote.changePercent} />
                {quote.marketState && quote.marketState !== "REGULAR" && (
                  <span className="muted"> · 장 마감 시세</span>
                )}
              </div>
              <div className="trade-form">
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                />
                <span className="muted">주 ≈ {cur(quote.currency)}{fmt(estimated, quote.currency)}</span>
                <button className="buy" disabled={busy} onClick={() => trade("BUY")}>매수</button>
                <button className="sell" disabled={busy} onClick={() => trade("SELL")}>매도</button>
              </div>

              <div className="chart-box">
                <div className="chart-controls">
                  <div className="range-tabs">
                    {CHART_RANGES.map(([value, label]) => (
                      <button
                        key={value}
                        className={chartRange === value ? "active" : ""}
                        onClick={() => changeRange(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="range-tabs">
                    <button
                      className={chartType === "candle" ? "active" : ""}
                      onClick={() => setChartType("candle")}
                    >
                      캔들
                    </button>
                    <button
                      className={chartType === "line" ? "active" : ""}
                      onClick={() => setChartType("line")}
                    >
                      라인
                    </button>
                    <button
                      className={showMA ? "active" : ""}
                      onClick={() => setShowMA((v) => !v)}
                      title="이동평균선 표시/숨김"
                    >
                      이동평균
                    </button>
                  </div>
                </div>
                {chartLoading ? (
                  <div className="muted" style={{ padding: "60px 0", textAlign: "center" }}>
                    차트 불러오는 중…
                  </div>
                ) : candles.length === 0 ? (
                  <div className="muted" style={{ padding: "60px 0", textAlign: "center" }}>
                    차트 데이터를 가져오지 못했습니다.
                  </div>
                ) : (
                  <>
                    <CandleChart
                      key={`${quote.symbol}-${chartType}-${showMA}-${myHolding?.avgCost ?? 0}`}
                      candles={candles}
                      type={chartType}
                      showMA={showMA}
                      avgCost={myHolding?.avgCost ?? null}
                    />
                    {(showMA || myHolding) && (
                      <div className="chart-legend">
                        {showMA && (
                          <>
                            <span><i style={{ background: "#ffb02e" }} />MA5</span>
                            <span><i style={{ background: "#2ecc71" }} />MA20</span>
                            <span><i style={{ background: "#b07cff" }} />MA60</span>
                          </>
                        )}
                        {myHolding && (
                          <span><i style={{ background: "#ffd34d" }} />내 평균단가</span>
                        )}
                      </div>
                    )}
                    {showMA && (
                      <div className="chart-hint">
                        이동평균선(MA)은 최근 N개 봉의 평균 가격입니다. 주가가 선 위에 있으면
                        상승 추세, 아래면 하락 추세로 참고하는 경우가 많아요.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="news-box">
                <div className="news-head">
                  <Newspaper size={14} /> 관련 뉴스 <span className="muted">· 등락 원인 참고</span>
                </div>
                {newsLoading ? (
                  <div className="muted">뉴스 불러오는 중…</div>
                ) : news.length === 0 ? (
                  <div className="muted">관련 뉴스를 찾지 못했습니다.</div>
                ) : (
                  <ul className="news-list">
                    {news.map((n, i) => (
                      <li key={i}>
                        <a href={n.link} target="_blank" rel="noopener noreferrer">
                          {n.title}
                        </a>
                        <div className="news-meta">
                          {n.source}
                          {n.publishedAt ? ` · ${timeAgo(n.publishedAt)}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        </div>

        {/* 즐겨찾기 */}
        <div className="panel">
          <h2><Star size={15} /> 즐겨찾기</h2>
          {favorites.length === 0 ? (
            <div className="empty">
              즐겨찾기가 없습니다. 종목 옆의 별 버튼으로 추가해 보세요.
            </div>
          ) : (
            <>
              <FavGroup title="한국장 (KR)" items={favKR} />
              <FavGroup title="미국장 (US)" items={favUS} />
            </>
          )}
        </div>

        {/* 포트폴리오 */}
        <div className="panel">
          <div className="row-head">
            <h2><PieChart size={15} /> 보유 종목</h2>
            <select
              className="sort-select"
              value={holdSort}
              onChange={(e) => setHoldSort(e.target.value as HoldSort)}
            >
              <option value="plPct">손익률순</option>
              <option value="value">평가금액순</option>
              <option value="name">이름순</option>
            </select>
          </div>
          {holdings.length === 0 ? (
            <div className="empty">보유 종목이 없습니다. 종목을 검색해 매수해 보세요.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>수량</th>
                    <th>평균단가</th>
                    <th>현재가</th>
                    <th>손익</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => {
                    const cls =
                      h.profitLoss == null ? "muted" : h.profitLoss > 0 ? "up" : h.profitLoss < 0 ? "down" : "muted";
                    return (
                      <tr key={h.symbol} className="clickable" onClick={() => selectSymbol(h.symbol)}>
                        <td>
                          {h.name}
                          <div className="small">{h.symbol}</div>
                        </td>
                        <td>{h.quantity}</td>
                        <td>{cur(h.currency)}{fmt(h.avgCost, h.currency)}</td>
                        <td>{h.currentPrice != null ? `${cur(h.currency)}${fmt(h.currentPrice, h.currency)}` : "-"}</td>
                        <td className={cls}>
                          {h.profitLoss != null
                            ? `${h.profitLoss > 0 ? "+" : ""}${fmt(h.profitLoss, h.currency)} (${h.profitLossPercent!.toFixed(2)}%)`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 거래 내역 */}
        <div className="panel full">
          <h2><History size={15} /> 거래 내역</h2>
          {txs.length === 0 ? (
            <div className="empty">거래 내역이 없습니다.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>일시 (UTC)</th>
                    <th>종목</th>
                    <th>구분</th>
                    <th>수량</th>
                    <th>체결가</th>
                    <th>총액</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{t.createdAt}</td>
                      <td>
                        {t.name}
                        <div className="small">{t.symbol}</div>
                      </td>
                      <td className={t.side === "BUY" ? "up" : "down"}>
                        {t.side === "BUY" ? "매수" : "매도"}
                      </td>
                      <td>{t.quantity}</td>
                      <td>{cur(t.currency)}{fmt(t.price, t.currency)}</td>
                      <td>{cur(t.currency)}{fmt(t.total, t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
