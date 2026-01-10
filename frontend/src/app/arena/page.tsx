"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore, OpenOrder, Mode } from "@/store";
import { useTradingLoop } from "@/hooks/useTradingLoop";
import { PromptLab } from "@/components/arena/PromptLab";
import { ActiveOrdersChart } from "@/components/arena/ActiveOrdersChart";
import { LogStream } from "@/components/arena/LogStream";
import { LlmInsight } from "@/components/arena/LlmInsight";
import { LlmTradesPanel } from "@/components/arena/LlmTradesPanel";
import { BadgeDollarSign, ListOrdered } from "lucide-react";
import Link from "next/link";
import { API_BASE } from "@/store";

export default function ArenaPage() {
  const { session, setSession, market, openOrders, appendLog } = useStore();
  const [sessionId, setSessionId] = useState(session?.id ?? "");
  const [mode, setMode] = useState<Mode>(session?.mode ?? "backtest");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [start, setStart] = useState("2024-01-01T00:00");
  const [end, setEnd] = useState("2024-01-08T00:00");
  const [isAttaching, setIsAttaching] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [attachError, setAttachError] = useState<string | null>(null);
  useTradingLoop();

  useEffect(() => {
    if (session) {
      setSessionId(session.id);
      setMode(session.mode);
    }
  }, [session]);

  const persistSession = useCallback((nextSession: { id: string; mode: Mode }) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("arena_session", JSON.stringify(nextSession));
  }, []);

  const validateSession = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${API_BASE}/state/${id}`);
      if (!resp.ok) return false;
      const json = await resp.json();
      return !json.error;
    } catch {
      return false;
    }
  }, []);

  const createAndAttachSession = useCallback(async () => {
    setIsAttaching(true);
    setAttachError(null);
    setStatus("Creating session...");
    try {
      const payload: any = { mode, symbol: symbol.toUpperCase(), initial_cash: 10000 };
      const toUtcMs = (value: string) => {
        if (!value) return undefined;
        // datetime-local is local time; append Z to treat as UTC
        return new Date(`${value}Z`).getTime();
      };
      const startMs = toUtcMs(start);
      const endMs = toUtcMs(end);
      if (startMs && endMs) {
        payload.start_ms = startMs;
        payload.end_ms = endMs;
      } else {
        payload.window = 500;
      }
      if (mode === "live") {
        payload.window = 500; // preload recent history for live
      }
      const resp = await fetch(`${API_BASE}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok || !json.session_id) {
        throw new Error(json.error || "Failed to create session");
      }
      const next = { id: json.session_id as string, mode };
      setSessionId(next.id);
      setSession(next);
      persistSession(next);
      setStatus("Attached");
      appendLog({
        time: new Date().toISOString(),
        thought: `Session attached: ${next.id}`,
        type: "info",
      });
      return next;
    } catch (err: any) {
      const msg = err?.message || "Failed to attach session";
      setAttachError(msg);
      appendLog({
        time: new Date().toISOString(),
        thought: msg,
        type: "error",
      });
      return null;
    } finally {
      setIsAttaching(false);
    }
  }, [appendLog, end, mode, persistSession, setSession, start, symbol]);

  useEffect(() => {
    if (session || isAttaching) return;
    let cancelled = false;
    const bootstrap = async () => {
      setStatus("Attaching session...");
      const cached =
        typeof window !== "undefined" ? window.localStorage.getItem("arena_session") : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { id: string; mode: Mode };
          const ok = await validateSession(parsed.id);
          if (!cancelled && ok) {
            setMode(parsed.mode);
            setSessionId(parsed.id);
            setSession(parsed);
            setStatus("Attached");
            return;
          }
        } catch {
          // ignore parse errors and create fresh session
        }
      }
      if (!cancelled) {
        await createAndAttachSession();
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [createAndAttachSession, isAttaching, session, setSession, validateSession]);

  const handleAttachExisting = useCallback(async () => {
    if (!sessionId) return;
    setIsAttaching(true);
    setAttachError(null);
    setStatus("Validating session...");
    const ok = await validateSession(sessionId);
    if (ok) {
      const next = { id: sessionId, mode };
      setSession(next);
      persistSession(next);
      setStatus("Attached");
      appendLog({
        time: new Date().toISOString(),
        thought: `Session attached: ${sessionId}`,
        type: "info",
      });
    } else {
      setAttachError("Session not found or expired, creating new one instead.");
      await createAndAttachSession();
    }
    setIsAttaching(false);
  }, [appendLog, createAndAttachSession, mode, persistSession, sessionId, setSession, validateSession]);

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
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200">
                <span className="font-semibold text-emerald-400">Session</span>
                <span className="font-mono">
                  {sessionId ? sessionId.slice(0, 8) + "..." : "creating..."}
                </span>
                {status && <span className="text-slate-400">({status})</span>}
              </div>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "backtest" | "live")}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
              >
                <option value="backtest">Backtest</option>
                <option value="live">Live</option>
              </select>
              <button
                onClick={createAndAttachSession}
                className="rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-900"
                disabled={isAttaching}
              >
                New Session
              </button>
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <span className="text-slate-400">Symbol</span>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  placeholder="Symbol"
                />
              </div>
              <div className="flex items-center gap-2">
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
                  onClick={createAndAttachSession}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-emerald-500"
                >
                  Use Custom Range
                </button>
              </div>
              <div className="text-xs text-slate-400">
                Data window: 2024-01-01T00:00Z — 2025-01-01T00:00Z (UTC). Inputs are treated as UTC.
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="Existing session (optional)"
                  className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
                <button
                  onClick={handleAttachExisting}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-emerald-500"
                  disabled={isAttaching}
                >
                  Attach Existing
                </button>
              </div>
              {attachError && <div className="text-xs text-amber-400">{attachError}</div>}
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
                equity={market.wallet?.equity}
              />
            </div>
          </div>

        {/* Right Sidebar */}
        <div className="h-full">
          <LlmInsight />
          <LlmTradesPanel />
          <LogStream />
        </div>
      </div>
    </main>
  );
}
