"use client";

import { useMemo, useState } from "react";

import { Sparkline } from "@/components/charts/Sparkline";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

function makeCurve() {
  const points: number[] = [];
  let v = 100;
  for (let i = 0; i < 42; i += 1) {
    v += Math.sin(i / 5) * 1.8 + (i % 7 === 0 ? 2.2 : -0.6);
    points.push(v);
  }
  return points;
}

export default function InteractPage() {
  const [prompt, setPrompt] = useState(
    "你是一个交易 Agent。只能交易 DOT。必须遵守最大回撤 5% 的风险规则。"
  );
  const [logs, setLogs] = useState<string[]>([
    "[10:03] Agent 启动：载入策略",
    "[10:04] 数据同步：OK",
    "[10:06] 信号：观望"
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m1",
      role: "assistant",
      content: "你可以用自然语言下达干预指令，例如：降低仓位、暂停交易、仅允许做多。",
      createdAt: Date.now()
    }
  ]);
  const [input, setInput] = useState("");

  const curve = useMemo(() => makeCurve(), []);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Interact</h1>
        <p className="text-sm text-white/60">
          右侧自然语言交互面板用于干预 Agent。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-7">
          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/90">收益曲线</div>
                  <div className="mt-1 text-xs text-white/60">示例数据（前端占位）</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70">
                  DOT Agent
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                <Sparkline points={curve} width={720} height={180} />
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-sm font-semibold text-white/90">提示词配置</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white/90 outline-none placeholder:text-white/35 focus:border-emerald-400/40"
              />
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
                  onClick={() => {
                    setLogs((prev) => [
                      `[${new Date().toLocaleTimeString()}] 更新 prompt：已保存（前端占位）`,
                      ...prev
                    ]);
                  }}
                >
                  保存配置
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-sm font-semibold text-white/90">历史日志</div>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <div className="max-h-64 overflow-auto p-3">
                  {logs.length === 0 ? (
                    <div className="text-sm text-white/60">暂无日志</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {logs.map((line, idx) => (
                        <div key={`${line}-${idx}`} className="text-sm text-white/80">
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="lg:col-span-3">
          <section className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/90">交互面板</div>
                <div className="mt-1 text-xs text-white/60">自然语言干预</div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={() => setMessages((prev) => prev.slice(0, 1))}
              >
                清空
              </button>
            </div>

            <div className="mt-4 flex h-[520px] flex-col overflow-hidden rounded-xl border border-white/10 bg-black/30">
              <div className="flex-1 overflow-auto p-3">
                <div className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "ml-auto bg-emerald-400/15 text-emerald-50"
                          : "mr-auto bg-white/5 text-white/85"
                      }`}
                    >
                      {m.content}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={2}
                    placeholder="输入指令，例如：暂停交易 15 分钟"
                    className="flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/35 focus:border-emerald-400/40"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-emerald-400/15 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={input.trim().length === 0}
                    onClick={() => {
                      const text = input.trim();
                      const now = Date.now();
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `u-${now}`,
                          role: "user",
                          content: text,
                          createdAt: now
                        },
                        {
                          id: `a-${now}`,
                          role: "assistant",
                          content: `已收到指令：${text}（前端占位，不会真正下单）`,
                          createdAt: now + 1
                        }
                      ]);
                      setLogs((prev) => [
                        `[${new Date().toLocaleTimeString()}] 干预：${text}`,
                        ...prev
                      ]);
                      setInput("");
                    }}
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

