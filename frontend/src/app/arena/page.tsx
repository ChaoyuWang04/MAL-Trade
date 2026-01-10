"use client";

import { useEffect, useState } from "react";
import { useStore, OpenOrder } from "@/store";
import { useTradingLoop } from "@/hooks/useTradingLoop";
import { PromptLab } from "@/components/arena/PromptLab";
import { ActiveOrdersChart } from "@/components/arena/ActiveOrdersChart";
import { LogStream } from "@/components/arena/LogStream";
import { BadgeDollarSign, ListOrdered } from "lucide-react";
import Link from "next/link";
import { API_BASE } from "@/store";

export default function ArenaPage() {
  const { session, setSession, market, openOrders } = useStore();
  const [sessionId, setSessionId] = useState(session?.id ?? "");
  const [mode, setMode] = useState(session?.mode ?? "backtest");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [start, setStart] = useState("2024-01-01T00:00");
  const [end, setEnd] = useState("2024-01-01T02:00");
  useTradingLoop();

  useEffect(() => {
    if (session) {
      setSessionId(session.id);
      setMode(session.mode);
    }
  }, [session]);

  const activeOrders = openOrders as OpenOrder[];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid h-screen grid-cols-[280px_1fr_320px] gap-4 p-4">
        {/* Left Sidebar */}
        <div className="h-full">
          <PromptLab />
        </div>

        {/* Center Arena */}
        <div className="flex h-full flex-col gap-4">
          <header className="flex items-center justify-between rounded-xl bg-slate-900 p-3">
            <div className="flex items-center gap-2">
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Session ID"
                className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "backtest" | "live")}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
              >
                <option value="backtest">Backtest</option>
                <option value="live">Live</option>
              </select>
              <button
                onClick={() => setSession({ id: sessionId, mode })}
                className="rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-900"
              >
                Attach Session
              </button>
              <div className="flex items-center gap-2">
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  placeholder="Symbol"
                />
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                />
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                />
                <button
                  onClick={async () => {
                    const start_ms = new Date(start).getTime();
                    const end_ms = new Date(end).getTime();
                    const resp = await fetch(`${API_BASE}/session`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        mode,
                        symbol,
                        initial_cash: 10000,
                        start_ms,
                        end_ms,
                      }),
                    });
                    const json = await resp.json();
                    if (json.session_id) {
                      setSessionId(json.session_id);
                      setSession({ id: json.session_id, mode });
                    }
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-emerald-500"
                >
                  Create Session
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1">
                <BadgeDollarSign className="h-4 w-4 text-emerald-400" />
                PnL: {(market.wallet?.equity ?? 0 - (market.wallet?.cash ?? 0)).toFixed(2)}
              </span>
              <span className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1">
                <ListOrdered className="h-4 w-4 text-amber-400" />
                Orders: {activeOrders.length}
              </span>
              <Link
                href="/arena/full"
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-emerald-500"
              >
                Full View
              </Link>
            </div>
          </header>

          <div className="rounded-xl bg-slate-900 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-200">Arena</div>
            <ActiveOrdersChart
              candles={market.candles || []}
              openOrders={activeOrders}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="h-full">
          <LogStream />
        </div>
      </div>
    </main>
  );
}
