import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.deepseek.com/chat/completions";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { system, user, model = "deepseek-chat", temperature = 0.2, apiKey: clientKey } = body || {};
  const apiKey = clientKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not set" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "user message required" }, { status: 400 });
  }

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || resp.statusText }, { status: 500 });
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "LLM request failed" }, { status: 500 });
  }
}
