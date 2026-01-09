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
      </div>
    </main>
  );
}
