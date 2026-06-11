import type { Market } from "@/lib/types";

// 종목 관련 뉴스 수집 (등락 원인 유추용) — 한국어 기사 우선
// - 1순위: Google News RSS 한국어 검색 (미국 종목도 한글 종목명으로 검색)
// - 보충: 결과가 적으면 Yahoo Finance 뉴스(영문)로 채움
// API 키 불필요. 5분 캐시.

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null; // ISO
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { items: NewsItem[]; at: number }>();

// 주요 종목 한글 검색명 매핑 (한국어 기사 검색 정확도 향상)
const KO_NAMES: Record<string, string> = {
  // 미국
  AAPL: "애플",
  MSFT: "마이크로소프트",
  NVDA: "엔비디아",
  GOOGL: "알파벳 구글",
  GOOG: "알파벳 구글",
  AMZN: "아마존",
  META: "메타 페이스북",
  TSLA: "테슬라",
  AVGO: "브로드컴",
  JPM: "JP모건",
  "BRK-B": "버크셔 해서웨이",
  NFLX: "넷플릭스",
  AMD: "AMD",
  INTC: "인텔",
  PLTR: "팔란티어",
  V: "비자",
  MA: "마스터카드",
  WMT: "월마트",
  ORCL: "오라클",
  QCOM: "퀄컴",
  MU: "마이크론",
  COIN: "코인베이스",
  UBER: "우버",
  DIS: "디즈니",
  NKE: "나이키",
  BA: "보잉",
  SBUX: "스타벅스",
  // 한국 (Yahoo가 영문명을 주는 경우 대비)
  "005930.KS": "삼성전자",
  "000660.KS": "SK하이닉스",
  "373220.KS": "LG에너지솔루션",
  "207940.KS": "삼성바이오로직스",
  "005380.KS": "현대차",
  "035420.KS": "네이버",
  "000270.KS": "기아",
  "051910.KS": "LG화학",
  "035720.KS": "카카오",
  "005490.KS": "포스코홀딩스",
  "068270.KS": "셀트리온",
  "105560.KS": "KB금융",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// "Samsung Electronics Co., Ltd." → "Samsung Electronics"
function cleanCompanyName(name: string): string {
  return name
    .replace(/\b(Co\.?,?\s*Ltd\.?|Inc\.?|Corp(?:oration)?\.?|Company|Holdings|PLC)\b/gi, "")
    .replace(/[,.\s]+$/g, "")
    .trim();
}

async function fetchWithUA(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function googleNewsKo(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=ko&gl=KR&ceid=KR:ko`;
  const xml = await (await fetchWithUA(url)).text();

  const items: NewsItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const b of blocks.slice(0, 12)) {
    const title = b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "";
    const link = b.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pub = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const source = b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "Google News";
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(title.trim()),
      link,
      source: decodeEntities(source.trim()),
      publishedAt: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

async function yahooNews(symbol: string): Promise<NewsItem[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol
  )}&quotesCount=0&newsCount=8`;
  const data = await (await fetchWithUA(url)).json();
  return ((data?.news ?? []) as any[])
    .filter((n) => n?.title && n?.link)
    .map((n) => ({
      title: String(n.title),
      link: String(n.link),
      source: n.publisher ? String(n.publisher) : "Yahoo Finance",
      publishedAt: n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toISOString()
        : null,
    }));
}

export async function getNews(
  symbol: string,
  name: string,
  market: Market
): Promise<NewsItem[]> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;

  const searchName = KO_NAMES[symbol] ?? cleanCompanyName(name) ?? symbol;
  const query = `${searchName} 주가`;

  const merged: NewsItem[] = [];
  try {
    merged.push(...(await googleNewsKo(query)));
  } catch (e: any) {
    console.error("[news] Google News 실패:", e?.message || e);
  }

  // 한국어 기사가 적으면 Yahoo 뉴스(영문)로 보충
  if (merged.length < 3) {
    try {
      merged.push(...(await yahooNews(symbol)));
    } catch (e: any) {
      console.error("[news] Yahoo 뉴스 실패:", e?.message || e);
    }
  }

  // 제목 기준 중복 제거 → 최신순 → 상위 8건
  const seen = new Set<string>();
  const items = merged
    .filter((n) => {
      const k = n.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 8);

  cache.set(symbol, { items, at: Date.now() });
  return items;
}
