import { useStore } from "@/store";

export function LlmInsight() {
  const thought = useStore((s) => s.llmThought);
  if (!thought) return null;

  return (
    <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-100">
      <div className="mb-2 text-xs font-semibold text-emerald-400">LLM Insight</div>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">
        {thought}
      </pre>
    </div>
  );
}
