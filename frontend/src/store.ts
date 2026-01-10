import { create } from "zustand";

export type Mode = "backtest" | "live";
export type Side = "BUY" | "SELL" | "HOLD" | "CANCEL";

export type Candle = {
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Wallet = {
  cash: number;
  position_qty: number;
  position_avg_price: number;
  equity: number;
  max_drawdown: number;
};

export type OpenOrder = {
  id: string;
  side: Side;
  type?: "LIMIT" | "MARKET";
  price: number;
  size: number;
  timestamp: number;
  stop_loss?: number;
  take_profit?: number;
};

export type LogLine = {
  time: string;
  thought?: string;
  action?: string;
  type: "info" | "trade" | "error";
};

type Session = { id: string; mode: Mode };
export type LlmTrade = {
  time: string;
  candle_time?: string;
  action: string;
  side?: string;
  price?: number;
  size_pct?: number;
  equity?: number;
  note?: string;
};

export type StoreState = {
  session?: Session;
  market: { price?: number; candles: Candle[]; wallet?: Wallet };
  openOrders: OpenOrder[];
  llmConfig: { systemPrompt: string; model: string; apiKey?: string; isAutoTrading: boolean };
  llmThought?: string;
  llmTrades: LlmTrade[];
  logs: LogLine[];
  onChain: {
    wallet?: string;
    autoSendLlm: boolean;
    destinationBuy: string;
    destinationSell: string;
  };

  setSession: (session?: Session) => void;
  setMarket: (
    update: Partial<StoreState["market"]> | ((prev: StoreState["market"]) => Partial<StoreState["market"]>)
  ) => void;
  setOpenOrders: (orders: OpenOrder[]) => void;
  setLlmConfig: (cfg: Partial<StoreState["llmConfig"]>) => void;
  setLlmThought: (thought?: string) => void;
  recordLlmTrade: (trade: LlmTrade) => void;
  appendLog: (line: LogLine) => void;
  setOnChain: (update: Partial<StoreState["onChain"]>) => void;
};

export const useStore = create<StoreState>((set) => ({
  session: undefined,
  market: { candles: [] },
  openOrders: [],
  llmConfig: {
    systemPrompt: "You are a cautious trader.",
    model: "gpt-4o",
    apiKey: undefined,
    isAutoTrading: false,
  },
  llmThought: typeof window !== "undefined" ? localStorage.getItem("llm_thought") ?? undefined : undefined,
  llmTrades: [],
  logs: [],
  onChain: {
    wallet: undefined,
    autoSendLlm: false,
    destinationBuy: "0xBC21C6945C08f08fD79561e606578E07A419eCC9",
    destinationSell: "0xf3b608cE0353136c84d9d3dB6d04fEb9962218Da",
  },
  setSession: (session) =>
    set((s) => {
      const isNew = session && s.session?.id !== session.id;
      return {
        session,
        ...(isNew
          ? {
              market: { candles: [], wallet: undefined },
              openOrders: [],
              logs: [],
            }
          : {}),
      };
    }),
  setMarket: (update) =>
    set((s) => {
      const patch = typeof update === "function" ? update(s.market) : update;
      return { market: { ...s.market, ...patch } };
    }),
  setOpenOrders: (orders) => set({ openOrders: orders }),
  setLlmConfig: (cfg) => set((s) => ({ llmConfig: { ...s.llmConfig, ...cfg } })),
  setLlmThought: (thought) => {
    if (typeof window !== "undefined") {
      if (thought) localStorage.setItem("llm_thought", thought);
      else localStorage.removeItem("llm_thought");
    }
    set({ llmThought: thought });
  },
  recordLlmTrade: (trade) =>
    set((s) => ({
      llmTrades: [...s.llmTrades.slice(-49), trade],
    })),
  appendLog: (line) =>
    set((s) => ({
      logs: [...s.logs.slice(-99), line],
    })),
  setOnChain: (update) =>
    set((s) => ({
      onChain: { ...s.onChain, ...update },
    })),
}));

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";
