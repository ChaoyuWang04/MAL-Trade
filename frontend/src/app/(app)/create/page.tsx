"use client";

import { useMemo, useState } from "react";

type ModelOption = "DeepSeek" | "ChatGPT" | "Gemini";

export default function CreatePage() {
  const [model, setModel] = useState<ModelOption>("DeepSeek");
  const [prompt, setPrompt] = useState("");
  const [created, setCreated] = useState<{
    model: ModelOption;
    prompt: string;
    createdAt: string;
  } | null>(null);

  const canSubmit = useMemo(() => prompt.trim().length > 0, [prompt]);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Create</h1>
        <p className="text-sm text-white/60">选择模型并配置提示词。</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm font-semibold text-white/90">模型</div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["DeepSeek", "ChatGPT", "Gemini"] as const).map((m) => {
              const active = m === model;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={`rounded-xl border px-3 py-3 text-sm transition ${
                    active
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="mt-6 text-sm font-semibold text-white/90">Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            placeholder="输入交易策略提示词，例如：\n- 只交易 DOT\n- 风控：最大回撤 5%\n- 每次下单需给出理由"
            className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/90 outline-none placeholder:text-white/35 focus:border-emerald-400/40"
          />

          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                const now = new Date().toISOString();
                setCreated({ model, prompt: prompt.trim(), createdAt: now });
              }}
              className="rounded-xl bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              创建 Agent
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm font-semibold text-white/90">预览</div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
            {created ? (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-white/70">
                  已创建（前端占位）：{new Date(created.createdAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {created.model}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
{created.prompt}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-white/60">
                创建后会显示 Agent 配置摘要。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

