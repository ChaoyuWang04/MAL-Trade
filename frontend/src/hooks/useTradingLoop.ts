import { useEffect, useRef } from "react";
import { useStore, Side, API_BASE, Candle } from "../store";
import { sendPasTxViaMetamask } from "@/lib/paseoTx";

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
type LlmContext = {
  price: number | null;
  wallet: any;
  open_orders: GymState["open_orders"];
  recent_bars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  data_window?: { start: string; end: string };
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
  const {
    session,
    llmConfig,
    setMarket,
    setOpenOrders,
    appendLog,
    openOrders,
    setLlmThought,
    recordLlmTrade,
    onChain,
  } = useStore();
  const running = useRef(false);
  const lastLiveUpdate = useRef<number>(0);
  const lastCandleKey = useRef<string | null>(null);
  const llmConfigRef = useRef(llmConfig);
  const openOrdersRef = useRef(openOrders);
  const onChainRef = useRef(onChain);
  const MAX_SIZE_PCT = 0.2;
  const RECENT_BARS = 200;
  const MAX_CANDLES_STORE = 2000;

  useEffect(() => {
    llmConfigRef.current = llmConfig;
  }, [llmConfig]);

  useEffect(() => {
    openOrdersRef.current = openOrders;
  }, [openOrders]);

  useEffect(() => {
    onChainRef.current = onChain;
  }, [onChain]);

  const buildContext = (state: GymState): LlmContext => ({
    price: state.candle?.bar?.close ?? null,
    wallet: state.wallet,
    open_orders: state.open_orders,
    recent_bars: (state.candles || [])
      .slice(-RECENT_BARS)
      .map((c) => ({
        time: c.bar.close_time,
        open: c.bar.open,
        high: c.bar.high,
        low: c.bar.low,
        close: c.bar.close,
        volume: c.bar.volume,
      })),
    data_window:
      state.candles && state.candles.length
        ? {
            start: state.candles[0].bar.open_time,
            end: state.candles[state.candles.length - 1].bar.close_time,
          }
        : undefined,
  });

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
            const candles = [...(prev.candles || []), nextCandle].slice(-MAX_CANDLES_STORE);
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
        const cfg = llmConfigRef.current;
        const openOrdersLatest = openOrdersRef.current;
        if (cfg?.isAutoTrading) {
          const promptInjected = (cfg.systemPrompt || "").replace(
            "{{open_orders}}",
            JSON.stringify(openOrdersLatest ?? [])
          );
          const context: LlmContext = buildContext(state);
          try {
            const llmStartedAt = performance.now();
            const candleTime = state.candle?.bar?.close_time || "n/a";
            appendLog({
              time: new Date().toISOString(),
              thought: `LLM request started (candle ${candleTime})`,
              type: "info",
            });
            const resp = await fetch("/api/llm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system: promptInjected,
                user: JSON.stringify(context),
                model: cfg.model || "deepseek-chat",
                apiKey: cfg.apiKey,
              }),
            });
            const { content, error } = await resp.json();
            if (error) throw new Error(error);
            // 期望 LLM 返回 JSON，需解析并校验
            const parsed = typeof content === "string" ? JSON.parse(content) : content;
            if (!parsed || typeof parsed !== "object") {
              throw new Error("LLM 返回为空");
            }
            const normalizedAction = String(parsed.action || "").toUpperCase();
            if (!["BUY", "SELL", "HOLD", "LIMIT", "CANCEL"].includes(normalizedAction)) {
              throw new Error(`未知 action: ${parsed.action}`);
            }
            decision = {
              action: normalizedAction as LlmDecision["action"],
              size_pct: parsed.size_pct,
              price: parsed.price,
              stop_loss: parsed.stop_loss,
              take_profit: parsed.take_profit,
              order_id: parsed.order_id,
              note: parsed.note,
            };
            const durationMs = Math.round(performance.now() - llmStartedAt);
            appendLog({
              time: new Date().toISOString(),
              thought: `LLM response parsed (${durationMs}ms) action=${decision.action} size=${decision.size_pct ?? "-"} price=${decision.price ?? "-"}`,
              type: "info",
            });
            setLlmThought(typeof content === "string" ? content : JSON.stringify(content));
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
          if (decision.size_pct && decision.size_pct > MAX_SIZE_PCT) {
            decision.size_pct = MAX_SIZE_PCT;
            appendLog({
              time: new Date().toISOString(),
              thought: `size_pct capped at ${MAX_SIZE_PCT}`,
              type: "info",
            });
          }
          // basic validation for limit/stop
          if (decision.action === "LIMIT") {
            if (!decision.price || decision.size_pct === undefined) {
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
            recordLlmTrade({
              time: new Date().toISOString(),
              candle_time: state.candle?.bar?.close_time,
              action: decision.action,
              side: decision.action === "CANCEL" ? undefined : decision.action,
              price: decision.price,
              size_pct: decision.size_pct,
              equity: state.wallet?.equity,
              note: decision.note,
            });
          const onChainCfg = onChainRef.current;
          if (
            onChainCfg?.autoSendLlm &&
            (decision.action === "BUY" || decision.action === "SELL")
          ) {
            const to =
              decision.action === "BUY" ? onChainCfg.destinationBuy : onChainCfg.destinationSell;
            try {
              const res = await sendPasTxViaMetamask({ to, amount: 0.1 });
              appendLog({
                time: new Date().toISOString(),
                thought: `LLM ${decision.action} on-chain 0.1 PAS -> ${to} (${res.hash})`,
                action: decision.action,
                type: "trade",
              });
            } catch (err: any) {
              appendLog({
                time: new Date().toISOString(),
                thought: err?.message || "LLM on-chain trade failed",
                type: "error",
              });
            }
          }
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

    const scheduleNext = (mode: string, backlogRemaining = 0) => {
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
    setMarket,
    setOpenOrders,
    appendLog,
    setLlmThought,
    recordLlmTrade,
  ]);
}
