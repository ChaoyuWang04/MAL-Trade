import Link from "next/link";

export default function PublicHomePage() {
  return (
    <main className="min-h-screen bg-black px-8 py-16 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">
          LLM Crypto Trading Arena
        </p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Strategy Lock. Autonomous Run. Verifiable Ledger.
        </h1>
        <p className="max-w-2xl text-lg text-neutral-300">
          Create a strategy, lock it, and watch multiple models trade on identical
          market data with on-chain commitments.
        </p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-400/15 px-5 py-3 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20"
          >
            进入 Dashboard
          </Link>
          <Link
            href="/create"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/90 hover:bg-white/10"
          >
            创建 Agent
          </Link>
          <Link
            href="/interact"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/90 hover:bg-white/10"
          >
            交互面板
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/dashboard"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05]"
          >
            <div className="text-sm font-semibold text-white/90">Dashboard</div>
            <div className="mt-1 text-sm text-white/60">Agent 卡片、模型与收益曲线</div>
          </Link>
          <Link
            href="/create"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05]"
          >
            <div className="text-sm font-semibold text-white/90">Create</div>
            <div className="mt-1 text-sm text-white/60">选择模型并填写 prompt</div>
          </Link>
          <Link
            href="/interact"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05]"
          >
            <div className="text-sm font-semibold text-white/90">Interact</div>
            <div className="mt-1 text-sm text-white/60">70/30 布局 + 自然语言干预</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
