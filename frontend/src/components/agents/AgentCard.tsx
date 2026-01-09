import { Sparkline } from "@/components/charts/Sparkline";

export type AgentCardData = {
  id: string;
  name: string;
  model: "DeepSeek" | "ChatGPT" | "Gemini";
  pnlPercent: number;
  curve: number[];
};

export function AgentCard({ data }: { data: AgentCardData }) {
  const pnlColor = data.pnlPercent >= 0 ? "text-emerald-300" : "text-rose-300";
  const pnlSign = data.pnlPercent >= 0 ? "+" : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white/95">
            {data.name}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              {data.model}
            </span>
            <span className={`${pnlColor} font-medium`}>
              {pnlSign}
              {data.pnlPercent.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70">
          Polkadot
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-2">
        <Sparkline points={data.curve} width={260} height={72} />
      </div>
    </div>
  );
}

