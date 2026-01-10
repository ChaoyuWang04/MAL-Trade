import { useEffect, useRef } from "react";
import { useStore, Side } from "../store";

type GymState = {
  candle?: { bar: { close: number } & Record<string, any> };
  wallet?: any;
  open_orders?: Array<{
    id: string;
    side: string;
    price: number;
    quantity: number;
    created_at: number;
  }>;
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

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

  useEffect(() => {
    if (!session || running.current) return;
    running.current = true;
    let stopped = false;

    const tick = async () => {
      if (stopped || !session) return;
      try {
        // Step A: fetch state
        const state: GymState = await fetch(`${API_BASE}/state/${session.id}`).then((r) => r.json());
        const price = state.candle?.bar?.close;
        if (price) {
          setMarket({ price, wallet: state.wallet, candles: state.candle ? [state.candle] : [] });
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
      scheduleNext(session.mode);
    };

    const scheduleNext = (mode: string) => {
      const delay = mode === "live" ? 1000 : 0;
      setTimeout(tick, delay);
    };

    tick();
    return () => {
      stopped = true;
      running.current = false;
    };
  }, [session, llmConfig.isAutoTrading, llmConfig.systemPrompt, openOrders, setMarket, setOpenOrders, appendLog]);
}
