import { useStore } from "@/store";

export function LlmTradesPanel() {
  const trades = useStore((s) => s.llmTrades);
  if (!trades.length) return null;
  return (
    <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-100">
      <div className="mb-2 text-xs font-semibold text-emerald-400">LLM Trades</div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {trades
          .slice()
          .reverse()
          .map((t, idx) => (
            <div key={idx} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>{new Date(t.time).toLocaleTimeString()}</span>
                <span className="text-amber-300">{t.action}</span>
              </div>
              <div className="text-slate-200">
                {t.side ? `${t.side} ` : ""}
                {t.price ? `@ ${t.price}` : ""}
                {t.size_pct !== undefined ? ` size ${Math.round((t.size_pct || 0) * 100)}%` : ""}
              </div>
              {t.equity !== undefined && (
                <div className="text-slate-300">Equity: {t.equity.toFixed(2)}</div>
              )}
              {t.note && <div className="text-slate-300">{t.note}</div>}
            </div>
          ))}
      </div>
    </div>
  );
}
