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

export type StoreState = {
  session?: Session;
  market: { price?: number; candles: Candle[]; wallet?: Wallet };
  openOrders: OpenOrder[];
  llmConfig: { systemPrompt: string; model: string; apiKey?: string; isAutoTrading: boolean };
  logs: LogLine[];

  setSession: (session?: Session) => void;
  setMarket: (update: Partial<StoreState["market"]>) => void;
  setOpenOrders: (orders: OpenOrder[]) => void;
  setLlmConfig: (cfg: Partial<StoreState["llmConfig"]>) => void;
  appendLog: (line: LogLine) => void;
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
  logs: [],
  setSession: (session) => set({ session }),
  setMarket: (update) => set((s) => ({ market: { ...s.market, ...update } })),
  setOpenOrders: (orders) => set({ openOrders: orders }),
  setLlmConfig: (cfg) => set((s) => ({ llmConfig: { ...s.llmConfig, ...cfg } })),
  appendLog: (line) =>
    set((s) => ({
      logs: [...s.logs.slice(-99), line],
    })),
}));
