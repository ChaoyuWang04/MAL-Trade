import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  ISeriesApi,
  CandlestickData,
  SeriesMarker,
  UTCTimestamp,
  Time,
} from "lightweight-charts";
import type { Candle, OpenOrder, LlmTrade } from "@/store";

type Props = {
  candles: Candle[];
  openOrders: OpenOrder[];
  equity?: number;
  trades?: LlmTrade[];
};

export function ActiveOrdersChart({ candles, openOrders, equity, trades }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<{ id: string; line: any }[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0f172a" }, textColor: "#cbd5e1" },
      grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      width: containerRef.current.clientWidth,
      height: 380,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#1f2937" },
      rightPriceScale: { borderColor: "#1f2937" },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const resize = () => chart.resize(containerRef.current!.clientWidth, 380);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      priceLinesRef.current.forEach((p) => p.line && series.removePriceLine(p.line));
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const parseTs = (value: string | number | undefined) => {
      if (value === undefined) return NaN;
      if (typeof value === "number") return value;
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
    };

    const data = candles
      .reduce<CandlestickData[]>((acc, c) => {
        const ts = parseTs(c.close_time || c.open_time);
        if (!Number.isFinite(ts)) return acc;
        acc.push({
          time: ts as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });
        return acc;
      }, [])
      .sort((a, b) => Number(a.time) - Number(b.time));

    if (data.length === 0) return;
    series.setData(data);

    priceLinesRef.current.forEach((p) => p.line && series.removePriceLine(p.line));
    priceLinesRef.current = [];
    openOrders.forEach((o) => {
      const line = series.createPriceLine({
        price: o.price,
        color: o.side === "BUY" ? "#22c55e" : "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `${o.side} ${o.price}`,
      });
      priceLinesRef.current.push({ id: o.id, line });
    });

    if (trades && trades.length) {
      const markers = trades.reduce<SeriesMarker<Time>[]>((acc, t) => {
        const ts = parseTs(t.candle_time || t.time);
        if (!Number.isFinite(ts) || !t.price) return acc;
        const isSell = (t.action || "").toUpperCase() === "SELL";
        acc.push({
          time: ts as UTCTimestamp,
          position: "aboveBar",
          color: isSell ? "#ef4444" : "#22c55e",
          shape: isSell ? "arrowDown" : "arrowUp",
          text: isSell ? "Sell" : "Buy",
        });
        return acc;
      }, []);
      series.setMarkers(markers);
    }
  }, [candles, openOrders, trades]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" />
      {equity !== undefined && (
        <div className="pointer-events-none absolute left-3 top-2 rounded bg-slate-800/80 px-2 py-1 text-xs text-slate-200">
          Equity: ${equity.toFixed(2)}
        </div>
      )}
    </div>
  );
}
