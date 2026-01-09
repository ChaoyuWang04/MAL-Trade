import Link from "next/link";

import { AgentCard, type AgentCardData } from "@/components/agents/AgentCard";

function seededCurve(seed: number) {
  let x = seed;
  const next = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };

  const points: number[] = [];
  let v = 100;
  for (let i = 0; i < 28; i += 1) {
    const drift = (next() - 0.5) * 4;
    v = Math.max(60, v + drift);
    points.push(v);
  }
  return points;
}

const agents: AgentCardData[] = [
  {
    id: "agent-1",
    name: "DOT Momentum v1",
    model: "DeepSeek",
    pnlPercent: 12.43,
    curve: seededCurve(11)
  },
  {
    id: "agent-2",
    name: "Mean Reversion",
    model: "ChatGPT",
    pnlPercent: -3.12,
    curve: seededCurve(22)
  },
  {
    id: "agent-3",
    name: "Breakout Hunter",
    model: "Gemini",
    pnlPercent: 8.77,
    curve: seededCurve(33)
  },
  {
    id: "agent-4",
    name: "Funding Arb",
    model: "ChatGPT",
    pnlPercent: 1.95,
    curve: seededCurve(44)
  },
  {
    id: "agent-5",
    name: "Volatility Clamp",
    model: "DeepSeek",
    pnlPercent: 5.02,
    curve: seededCurve(55)
  },
  {
    id: "agent-6",
    name: "Trend + Risk Guard",
    model: "Gemini",
    pnlPercent: 16.31,
    curve: seededCurve(66)
  }
];

export default function DashboardPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-white/60">
          查看每个波卡 Agent 的模型与收益曲线。
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-white/70">
          共 {agents.length} 个 Agent
        </div>
        <Link
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
          href="/create"
        >
          创建新 Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} data={agent} />
        ))}
      </div>
    </main>
  );
}

