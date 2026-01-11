# Frontend Usage Guide (Trading Gym)

## 1) Prerequisites
- Backend running at `http://localhost:3001` with data ingested:
  ```bash
  cd backend
  cargo run -p data-ingest -- --symbol BTCUSDT ingest --year 2024 --month 1
  cargo run -p api
  ```
- Create a session (example backtest window):
  ```bash
  curl -X POST http://localhost:3001/session \
    -H "Content-Type: application/json" \
    -d '{"mode":"backtest","symbol":"BTCUSDT","initial_cash":10000,"start_ms":1704067200000,"end_ms":1704074400000}'
  ```
  Response gives `"session_id"`; keep it handy.
- Frontend env: `frontend/.env.local`
  ```
  DEEPSEEK_API_KEY=sk-...your key...
  # optional: override backend API base (defaults to http://localhost:3001)
  NEXT_PUBLIC_API_BASE=http://localhost:3001
  # Frontend (MetaMask) public config
  NEXT_PUBLIC_PASEO_RPC_URL=https://testnet-passet-hub-eth-rpc.polkadot.io
  NEXT_PUBLIC_PASEO_EXCHANGE_WALLET=0x000000000000000000000000000000000000dEaD
  # Paseo (Asset Hub) native PAS trading
  PASEO_RPC_URL=https://testnet-passet-hub-eth-rpc.polkadot.io
  PASEO_PRIVATE_KEY= # your Paseo testnet private key (do not commit)
  PASEO_EXCHANGE_WALLET=0x000000000000000000000000000000000000dEaD # replace with your target wallet
  ```

## 2) Frontend setup
```bash
cd frontend
npm install
npm run dev
```
Visit `http://localhost:3000`.

## 3) How to attach a session
- Open `/arena`.
- The page auto-creates and attaches a backtest session (stored in `localStorage`); you can switch mode/symbol and click **New Session** to refresh.
- Optional: provide a custom time range, then click **Use Custom Range** to recreate the session over that slice.
- Custom range inputs are treated as UTC; current data window hint shows 2024-01-01T00:00Z — 2025-01-01T00:00Z.
- Live mode preloads the latest 500 bars from local Parquet before streaming ticks, so charts are populated immediately.
- LLM auto-trading sends the last 200 bars, wallet, open orders, and data_window to `/api/llm`; decisions are expected as JSON with LIMIT/CANCEL/HOLD (size_pct capped at 0.2).
- Prompt Lab now has **Think Once** to let the LLM reason without trading (uses your prompt/model/key and shows the raw response).
- LLM outputs are shown in the right sidebar (LLM Insight); no popups.
- LLM Trades panel shows recent actions (time/price/size/equity). Manual commands: **Stop** (turn off Auto) and **Buy 10%** (market buy size_pct 0.1).

## 4) Lab mode
- Visit `/lab` for a dedicated prompt playground with context (price/equity/open orders/last bar) and read-only chart.
- Use **Think Once** with your API key; outputs appear in the right LLM Insight panel. Auto-trading still runs the same loop if enabled.
- A preset **DeepSeek V3 Prompt** button injects a jailbreak-style prompt that forces a JSON action.
- The chart will show prices; orders count shows open limit orders.
- Click **Full View** for expanded chart + logs.

## 4) Configure LLM (Prompt Lab)
- Open `/lab` or use the left sidebar on `/arena`.
- Edit System Prompt; use chips like `{{open_orders}}`, `{{price}}`, `{{rsi}}`.
- Choose model (e.g., `deepseek-v3`), set API key (stored locally).
- Toggle **Auto** to let the loop call the LLM each tick.

## 5) Loop behavior
- Every tick: fetch `/state/:id` → update price/wallet/open_orders.
- If Auto enabled: inject `{{open_orders}}` into the prompt → call `/api/llm` (DeepSeek proxy) → expect JSON decision.
- LIMIT orders require `price` (and optional `stop_loss/take_profit`); CANCEL requires `order_id`.
- Actions sent to backend `/action/:id` with proper fields.

## 6) On-chain PAS trades (MetaMask + Paseo Asset Hub)
- Arena/Lab 顶部新增「On-chain PAS」卡片：
  - 点击 **Connect MetaMask**：自动 `wallet_addEthereumChain` + `wallet_switchEthereumChain` 到 Paseo (chainId `420420422`, RPC `https://testnet-passet-hub-eth-rpc.polkadot.io`, symbol `PAS`)，显示地址/余额。
  - 按钮 **BUY 0.1 PAS / SELL 0.1 PAS**：通过 MetaMask `eth_sendTransaction` 发送原生 PAS 到硬编码地址（BUY → `0xBC21C6945C08f08fD79561e606578E07A419eCC9`，SELL → `0xf3b608cE0353136c84d9d3dB6d04fEb9962218Da`）。你可在 `.env` 覆盖 `NEXT_PUBLIC_PASEO_EXCHANGE_WALLET` 供手动按钮使用。
  - 切换 **LLM 自动上链 开/关**：开启后，LLM 的 BUY/SELL 决策会自动各发送 0.1 PAS 到上述硬编码地址（BUY→买入地址，SELL→卖出地址），同时保留纸面下单逻辑。
  - 交易成功后展示 Blockscout 链接；余额不足会提示去 Faucet。
  - LLM 日志会记录请求开始/结束、耗时和当前蜡烛时间，便于排查延迟。
- Faucet：`https://faucet.polkadot.io/`（领取 PAS 测试币后重试）。
- 备用后端路由（私钥发送，不建议默认用）：`POST /api/trade`
  - Body: `{ "action": "BUY" | "SELL", "amount"?: number (default 0.01), "to"?: "0x..." }`
  - 使用 `PASEO_PRIVATE_KEY` 和 `PASEO_RPC_URL`，响应含 `txHash` 与 Blockscout 链接。
  - 示例：
    ```ts
    import { executeOnChainTrade } from "@/lib/trade";
    const { txHash, explorerUrl } = await executeOnChainTrade({ action: "BUY", amount: 0.01 });
    ```

## 7) Troubleshooting
- If chart shows nothing: ensure session_id is valid and backend running.
- The Stream panel now logs session attach results and state fetch issues; check it for errors.
- If LLM errors: check `DEEPSEEK_API_KEY`, and ensure the LLM returns valid JSON.
- Hydration guard: LLM Insight only appears after client hydration loads the saved thought; an empty panel at first render is expected and prevents server/client text mismatch.
- Auto-trading uses the latest prompt/config immediately; toggling Auto will update the live loop without a refresh.
- Browser extensions (e.g., Talisman) may inject errors; the app now silences known Talisman init errors, but disabling the extension is recommended if issues persist.
- Prompt Lab 标题已固定并关闭翻译引起的水合差异，如仍有提示可刷新清除旧缓存。
- LLM 输出如果包含 `should_buy/buy=true` 或 `decision:"yes"` 也会触发 BUY（默认 size_pct 0.1）。
- On-chain PAS：连接 MetaMask 后若余额 < 0.11 PAS 会提示先去 Faucet；链上 BUY/SELL（手动或 LLM 自动）会记录在 On-chain Tx Log，失败原因也可见。
