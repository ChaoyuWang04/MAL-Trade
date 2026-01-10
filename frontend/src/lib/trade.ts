export type TradeAction = "BUY" | "SELL";

export type TradeResponse = {
  txHash: string;
  explorerUrl: string;
  amount: number;
  to: string;
};

export async function executeOnChainTrade(params: {
  action: TradeAction;
  amount?: number;
  to?: string;
}): Promise<TradeResponse> {
  const body = {
    action: params.action,
    amount: params.amount ?? 0.01,
    ...(params.to ? { to: params.to } : {}),
  };

  const resp = await fetch("/api/trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error || "Trade request failed");
  }
  return json as TradeResponse;
}
