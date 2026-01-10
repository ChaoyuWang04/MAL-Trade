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
- Input the `session_id` from the backend response.
- Select mode (`backtest` or `live`), then click **Attach Session**.
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
- If LLM errors: check `DEEPSEEK_API_KEY`, and ensure the LLM returns valid JSON.
- Hydration errors can occur if server/client text mismatch; titles are now fixed to "Prompt Lab".
