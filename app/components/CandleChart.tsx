"use client";

import { useEffect, useRef } from "react";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ChartType = "candle" | "line";

// 한국식 색상: 상승 빨강, 하락 파랑
const UP = "#f04452";
const DOWN = "#3182f6";

// 이동평균선 정의 (초보 참고용 가상선)
export const MA_DEFS = [
  { period: 5, color: "#ffb02e" },
  { period: 20, color: "#2ecc71" },
  { period: 60, color: "#b07cff" },
] as const;

export const AVG_COST_COLOR = "#ffd34d";

function maData(candles: Candle[], period: number) {
  const out: { time: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export default function CandleChart({
  candles,
  type = "candle",
  showMA = false,
  avgCost = null,
}: {
  candles: Candle[];
  type?: ChartType;
  showMA?: boolean;
  avgCost?: number | null; // 보유 종목 평균 매입가 (점선 표시)
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const mainRef = useRef<any>(null);
  const maRefs = useRef<any[]>([]);
  const propsRef = useRef({ candles, type, showMA, avgCost });
  propsRef.current = { candles, type, showMA, avgCost };

  // 차트 생성 — type/showMA/avgCost가 바뀌면 부모에서 key로 리마운트됨
  useEffect(() => {
    let disposed = false;
    (async () => {
      const { createChart, ColorType, LineStyle } = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const p = propsRef.current;

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#9aa1ad",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#232833" },
          horzLines: { color: "#232833" },
        },
        timeScale: { borderColor: "#2a2f3a", timeVisible: true },
        rightPriceScale: { borderColor: "#2a2f3a" },
        crosshair: { mode: 0 },
      });

      let main: any;
      if (p.type === "line") {
        main = chart.addAreaSeries({
          lineColor: "#4f8cff",
          topColor: "rgba(79, 140, 255, 0.25)",
          bottomColor: "rgba(79, 140, 255, 0)",
          lineWidth: 2,
        });
        main.setData(p.candles.map((c) => ({ time: c.time, value: c.close })) as any);
      } else {
        main = chart.addCandlestickSeries({
          upColor: UP,
          borderUpColor: UP,
          wickUpColor: UP,
          downColor: DOWN,
          borderDownColor: DOWN,
          wickDownColor: DOWN,
        });
        main.setData(p.candles as any);
      }

      if (p.showMA) {
        maRefs.current = MA_DEFS.map((d) => {
          const s = chart.addLineSeries({
            color: d.color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          s.setData(maData(p.candles, d.period) as any);
          return s;
        });
      }

      if (p.avgCost != null && p.avgCost > 0) {
        main.createPriceLine({
          price: p.avgCost,
          color: AVG_COST_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "평균단가",
        });
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;
      mainRef.current = main;
    })();
    return () => {
      disposed = true;
      try {
        chartRef.current?.remove();
      } catch {
        /* noop */
      }
      chartRef.current = null;
      mainRef.current = null;
      maRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 캔들 데이터만 바뀐 경우(기간 변경 등) 갱신
  useEffect(() => {
    if (!mainRef.current) return;
    const p = propsRef.current;
    if (p.type === "line") {
      mainRef.current.setData(candles.map((c) => ({ time: c.time, value: c.close })) as any);
    } else {
      mainRef.current.setData(candles as any);
    }
    MA_DEFS.forEach((d, i) => maRefs.current[i]?.setData(maData(candles, d.period) as any));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} style={{ width: "100%", height: 260 }} />;
}
