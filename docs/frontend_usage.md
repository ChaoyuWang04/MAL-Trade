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
- LLM auto-trading sends the last 200 bars, wallet, and open orders to `/api/llm`; decisions are expected as JSON with LIMIT/CANCEL/HOLD (size_pct capped at 0.2).
- Prompt Lab now has **Think Once** to let the LLM reason without trading (uses your prompt/model/key and shows the raw response).
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

## 6) Troubleshooting
- If chart shows nothing: ensure session_id is valid and backend running.
- The Stream panel now logs session attach results and state fetch issues; check it for errors.
- If LLM errors: check `DEEPSEEK_API_KEY`, and ensure the LLM returns valid JSON.
- Hydration errors can occur if server/client text mismatch; titles are now fixed to "Prompt Lab".
- Browser extensions (e.g., Talisman) may inject errors; the app now silences known Talisman init errors, but disabling the extension is recommended if issues persist.
