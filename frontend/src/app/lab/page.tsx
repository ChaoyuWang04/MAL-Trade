"use client";

import { PromptLab } from "@/components/arena/PromptLab";
import { useTradingLoop } from "@/hooks/useTradingLoop";

export default function LabPage() {
  useTradingLoop();
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Prompt Lab</h1>
        <PromptLab />
      </div>
    </main>
  );
}
