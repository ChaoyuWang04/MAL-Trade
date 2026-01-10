"use client";

import { useEffect } from "react";
import { useTradingLoop } from "@/hooks/useTradingLoop";
import { ActiveOrdersChart } from "@/components/arena/ActiveOrdersChart";
import { LogStream } from "@/components/arena/LogStream";
import { useStore } from "@/store";

export default function FullArenaPage() {
  const { market, openOrders, session } = useStore();
  useTradingLoop();

  useEffect(() => {
    if (!session) {
      console.warn("Attach a session from /arena first");
    }
  }, [session]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid h-screen grid-cols-[2fr_1fr] gap-4 p-4">
        <div className="rounded-xl bg-slate-900 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-200">Expanded Chart</div>
          <ActiveOrdersChart candles={market.candles || []} openOrders={openOrders} />
        </div>
        <div>
          <LogStream />
        </div>
      </div>
    </main>
  );
}
