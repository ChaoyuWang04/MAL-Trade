import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { ToggleLeft, ToggleRight } from "lucide-react";

const chips = ["{{price}}", "{{rsi}}", "{{open_orders}}"];

export function PromptLab() {
  const { llmConfig, setLlmConfig } = useStore();
  const [draft, setDraft] = useState(llmConfig.systemPrompt);
  const [apiKey, setApiKey] = useState(llmConfig.apiKey ?? "");
  const [thinking, setThinking] = useState(false);
  const [thinkError, setThinkError] = useState<string | null>(null);
  const setLlmThought = useStore((s) => s.setLlmThought);
  const appendLog = useStore((s) => s.appendLog);

  useEffect(() => {
    const saved = localStorage.getItem("llm_api_key");
    if (saved) {
      setApiKey(saved);
      setLlmConfig({ apiKey: saved });
    }
  }, [setLlmConfig]);

  const applyPrompt = () => setLlmConfig({ systemPrompt: draft });
  const applyApiKey = () => {
    setLlmConfig({ apiKey });
    localStorage.setItem("llm_api_key", apiKey);
  };

  const handleThink = async () => {
    setThinking(true);
    setThinkError(null);
    try {
      const resp = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: draft,
          user: "Think about the current market context and propose an action JSON. (Manual think mode)",
          model: llmConfig.model || "deepseek-chat",
          apiKey: apiKey || llmConfig.apiKey,
        }),
      });
      const { content, error } = await resp.json();
      if (error) throw new Error(error);
      setLlmThought(content || "No content");
      appendLog({
        time: new Date().toISOString(),
        thought: "LLM think completed",
        type: "info",
      });
    } catch (e: any) {
      setThinkError(e?.message || "LLM think failed");
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl bg-slate-900 p-4 text-sm text-slate-100">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">Prompt Lab</span>
        <button
          onClick={() => setLlmConfig({ isAutoTrading: !llmConfig.isAutoTrading })}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-2 py-1 text-xs hover:border-emerald-500"
        >
          {llmConfig.isAutoTrading ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
          Auto
        </button>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setDraft((d) => `${d} ${c}`.trim())}
              className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              {c}
            </button>
          ))}
        </div>
        <textarea
          className="min-h-[160px] w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <button className="rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-900" onClick={applyPrompt}>
            Apply Prompt
          </button>
          <button
            onClick={handleThink}
            disabled={thinking}
            className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:border-emerald-500 disabled:opacity-50"
          >
            Think Once
          </button>
        </div>
        {thinkError && <div className="text-xs text-red-400">{thinkError}</div>}
      </div>

      <div className="space-y-2">
        <div className="text-xs text-slate-400">Model</div>
        <select
          value={llmConfig.model}
          onChange={(e) => setLlmConfig({ model: e.target.value })}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
        >
          <option>gpt-4o</option>
          <option>gpt-3.5-turbo</option>
          <option>deepseek-v3</option>
        </select>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-slate-400">API Key</div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={applyApiKey}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
          placeholder="sk-..."
        />
      </div>
    </div>
  );
}
