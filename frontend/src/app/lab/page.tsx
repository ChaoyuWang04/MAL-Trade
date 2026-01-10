"use client";

import { useEffect } from "react";
import { PromptLab } from "@/components/arena/PromptLab";
import { LlmInsight } from "@/components/arena/LlmInsight";
import { LogStream } from "@/components/arena/LogStream";
import { ActiveOrdersChart } from "@/components/arena/ActiveOrdersChart";
import { useTradingLoop } from "@/hooks/useTradingLoop";
import { useStore } from "@/store";
import { LlmTradesPanel } from "@/components/arena/LlmTradesPanel";
import { OnChainControls } from "@/components/arena/OnChainControls";

export default function LabPage() {
  const { market, openOrders } = useStore();
  useTradingLoop();

  const latest = market.candles[market.candles.length - 1];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen grid-cols-[320px_1fr_360px] gap-4 p-4">
        <div className="h-full">
          <PromptLab />
        </div>
        <div className="flex h-full flex-col gap-4">
          <OnChainControls />
          <div className="rounded-xl bg-slate-900 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-200">Context</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>Price: {market.price ? market.price.toFixed(2) : "—"}</div>
              <div>Equity: {market.wallet?.equity ? market.wallet.equity.toFixed(2) : "—"}</div>
              <div>Open orders: {openOrders.length}</div>
              <div>
                Last bar: {latest ? new Date(latest.close_time).toISOString() : "—"}
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-200">Chart (read-only)</div>
            <ActiveOrdersChart
              candles={market.candles || []}
              openOrders={openOrders}
              equity={market.wallet?.equity}
              trades={useStore((s) => s.llmTrades)}
            />
          </div>
        </div>
        <div className="h-full">
          <LlmInsight />
          <LlmTradesPanel />
          <LogStream />
        </div>
      </div>
    </main>
  );
}
