import { useEffect, useRef } from "react";
import { useStore, Side, API_BASE, Candle } from "../store";

type GymState = {
  candle?: { bar: { close: number } & Record<string, any> };
  candles?: Array<{ bar: { close: number } & Record<string, any> }>;
  wallet?: any;
  open_orders?: Array<{
    id: string;
    side: string;
    price: number;
    quantity: number;
    created_at: number;
  }>;
  backlog_remaining?: number;
};

type LlmDecision = {
  action: Side | "LIMIT" | "CANCEL";
  size_pct?: number;
  price?: number;
  stop_loss?: number;
  take_profit?: number;
  order_id?: string;
  note?: string;
};

async function mockLLM(systemPrompt: string, state: GymState): Promise<LlmDecision> {
  const price = state.candle?.bar?.close || 0;
  return {
    action: "LIMIT",
    size_pct: 0.2,
    price: price * 0.995,
    stop_loss: price * 0.985,
    take_profit: price * 1.01,
    note: "mock limit with SL/TP",
  };
}

export function useTradingLoop() {
  const { session, llmConfig, setMarket, setOpenOrders, appendLog, openOrders } = useStore();
  const running = useRef(false);
  const lastLiveUpdate = useRef<number>(0);
  const lastCandleKey = useRef<string | null>(null);

  useEffect(() => {
    if (!session || running.current) return;
    running.current = true;
    let stopped = false;

    const tick = async () => {
      if (stopped || !session) return;
      try {
        // Step A: fetch state
        const steps =
          session.mode === "live" && (lastLiveUpdate.current === 0 || lastLiveUpdate.current > 0)
            ? 50
            : 1;
        const resp = await fetch(`${API_BASE}/state/${session.id}?steps=${steps}`);
        if (!resp.ok) {
          throw new Error(`state fetch failed (${resp.status})`);
        }
        const state: GymState = await resp.json();
        const backlogRemaining = state.backlog_remaining ?? 0;
        if (!state.candle) {
          appendLog({
            time: new Date().toISOString(),
            thought:
              session.mode === "backtest"
                ? "backtest finished, no more candles"
                : "state missing candle, waiting for next tick",
            type: "info",
          });
          if (session.mode === "backtest") {
            stopped = true;
            running.current = false;
            return;
          }
          scheduleNext(session.mode, backlogRemaining);
          return;
        }
        const bars = state.candles && state.candles.length > 0 ? state.candles : state.candle ? [state.candle] : [];
        for (const wrapped of bars) {
          const bar = wrapped.bar as any;
          const candleKey = `${bar.open_time}-${bar.close_time}`;
          if (candleKey === lastCandleKey.current) continue;
          lastCandleKey.current = candleKey;
          if (session.mode === "live" && backlogRemaining === 0) {
            const now = Date.now();
            if (now - lastLiveUpdate.current < 200) {
              continue;
            }
            lastLiveUpdate.current = now;
          }
          const nextCandle: Candle = {
            open_time: bar.open_time,
            close_time: bar.close_time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          };
          setMarket((prev) => {
            const candles = [...(prev.candles || []), nextCandle].slice(-500);
            return { price: bar.close, wallet: state.wallet, candles };
          });
        }
        if (state.open_orders) {
          setOpenOrders(
            state.open_orders.map((o) => ({
              id: o.id,
              side: o.side.toUpperCase() as Side,
              price: o.price,
              size: o.quantity,
              timestamp: o.created_at,
            }))
          );
        }

        // Step B: think
        let decision: LlmDecision = { action: "HOLD" };
        if (llmConfig.isAutoTrading) {
          const promptInjected = llmConfig.systemPrompt.replace(
            "{{open_orders}}",
            JSON.stringify(openOrders ?? [])
          );
          try {
            const resp = await fetch("/api/llm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system: promptInjected,
                user: JSON.stringify({ price, open_orders: openOrders }),
                model: llmConfig.model || "deepseek-chat",
                apiKey: llmConfig.apiKey,
              }),
            });
            const { content, error } = await resp.json();
            if (error) throw new Error(error);
            // 期望 LLM 返回 JSON，需解析
            decision = JSON.parse(content);
          } catch (e: any) {
            appendLog({
              time: new Date().toISOString(),
              thought: e?.message || "LLM error",
              type: "error",
            });
            decision = { action: "HOLD" };
          }
        }

        // Step C: act
        if (decision.action && decision.action !== "HOLD") {
          // basic validation for limit/stop
          if (decision.action === "LIMIT") {
            if (!decision.price || !decision.stop_loss || decision.size_pct === undefined) {
              appendLog({
                time: new Date().toISOString(),
                thought: "invalid limit payload",
                type: "error",
              });
              scheduleNext(session.mode);
              return;
            }
          }
          const body: any = {
            action: decision.action === "CANCEL" ? "HOLD" : decision.action,
            size_pct: decision.size_pct ?? 0,
          };
          if (decision.action === "LIMIT") {
            body.type = "LIMIT";
            body.price = decision.price;
            body.stop_loss = decision.stop_loss;
            body.take_profit = decision.take_profit;
          }
          if (decision.action === "CANCEL" && decision.order_id) {
            body.order_id = decision.order_id;
          }
          await fetch(`${API_BASE}/action/${session.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          appendLog({
            time: new Date().toISOString(),
            thought: decision.note,
            action: decision.action,
            type: "trade",
          });
        }
      } catch (err: any) {
        appendLog({
          time: new Date().toISOString(),
          thought: err?.message || String(err),
          type: "error",
        });
      }
      scheduleNext(session.mode, 0);
    };

    const scheduleNext = (mode: string, backlogRemaining: number) => {
      const delay = mode === "live" && backlogRemaining === 0 ? 1000 : 0;
      setTimeout(tick, delay);
    };

    tick();
    return () => {
      stopped = true;
      running.current = false;
    };
  }, [
    session,
    llmConfig.isAutoTrading,
    llmConfig.systemPrompt,
    llmConfig.model,
    llmConfig.apiKey,
    openOrders,
    setMarket,
    setOpenOrders,
    appendLog,
  ]);
}
