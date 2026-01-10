# Backend Overview (Rust, Offline Backtest)

- Scope: BTCUSDT-only offline backtesting using 1m klines as source of truth; derive higher timeframes (incl. 7-day view) via aggregation.
- Data strategy: download Binance Vision CSV/ZIP for ~2 months, convert to Parquet (snappy), store under `data/spot/BTCUSDT/klines_1m/YYYY-MM.parquet`; keep metadata offsets; optional CSV export for audits.
- Components (workspace): `data-ingest` (Binance Vision ZIP downloader + CSV→Parquet via Polars + gap detection), `feature-engine` (EMA/RSI/CMF), `backtester` (bar-driven with fees/slippage), `llm-agent` (structured action schema), `api` (Axum HTTP reading Parquet via `ParquetDataSource`), `storage` (FS helpers).
- DataSource: Parquet/FS backed; API reads slices or latest window from `data/spot/<symbol>/klines_1m/*.parquet`.
- Outputs: feature frames, LLM decision logs, backtest metrics (PnL, max drawdown, trades, costs); all reproducible from the same FeatureFrame window.
- Commands: `just deps` (cargo fetch), `just dev-backend` (cargo run -p api), `just build-backend` (cargo build --workspace), `just test-backend` (cargo test --workspace), `just download-history SYMBOL YEAR MONTH` (run data-ingest download+convert for monthly file; add `--day` via cargo args if needed).

## API Surface (Axum, universal trading gym)

- Base: local server listens on `0.0.0.0:3001`.
- `GET /health` → `{"status":"ok"}`.
- `POST /session` → create a session
  - Body: `{ "mode": "backtest" | "live", "symbol"?: "BTCUSDT", "initial_cash"?: 10000, "start_ms"?: int, "end_ms"?: int, "window"?: int }`
  - Backtest: if `start_ms`/`end_ms` provided, uses that slice; otherwise pulls the latest `window` bars (default 500) from Parquet.
  - Live: preloads the latest `window` bars from local Parquet (default 500) before streaming WS ticks, so the chart isn’t empty at start.
  - Response: `{ "session_id": "<uuid>", "mode": "Backtest"|"Live" }`
- `GET /state/:session_id` → advance/read state
  - For backtest: returns next candle in the sequence.
  - For live: returns latest buffered candle (non-blocking).
  - Response: `{ session_id, mode, candle?, wallet }` where `candle` mirrors FeatureBar (OHLCV + indicators placeholders), `wallet` is paper account snapshot.
- `POST /action/:session_id` → apply BUY/SELL/HOLD
  - Body: `{ "action": "BUY"|"SELL"|"HOLD", "size_pct": 0.0-1.0 }`
  - Uses current candle price to update wallet (cash/position).
  - Response: `{ session_id, wallet }`
- `POST /backtests`
  - Request JSON:
    - `symbol` (string, default `"BTCUSDT"`)
    - `initial_cash` (number, default `10000`)
    - Either:
      - `start_ms` (int64 epoch ms) and `end_ms` (int64 epoch ms) to slice Parquet; **use a range present in data**, e.g., Jan 1 2024 00:00–02:00 UTC.
      - Or omit start/end and use `window` (integer, default `500`) to pull the latest N bars.
  - Behavior: loads bars from Parquet via `ParquetDataSource`, computes indicators, runs backtester with HOLD-only actions (placeholder), returns metrics/trades.
  - Response JSON:
    - `result`: object with `symbol`, `start`, `end` (RFC3339), `initial_cash`, `final_state` (`cash`, `position_qty`, `position_avg_price`, `equity`, `max_drawdown`), and `trades` array (`bar_time`, `action`, `fill_price`, `qty`, `fee_paid`, `slippage_bps`, `resulting_state`).

### Example curl (uses Jan 1 2024 slice)
```bash
curl -X POST http://localhost:3001/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "initial_cash": 10000,
    "start_ms": 1704067200000,
    "end_ms":   1704074400000
  }'
```
`1704067200000` = 2024-01-01T00:00:00Z, `1704074400000` = 2024-01-01T02:00:00Z; ensure data for that range exists (downloaded via ingest).

### Example: create + poll + trade (backtest mode)
```bash
# 1) Create session over Jan 1 2024 00:00–02:00 UTC
curl -X POST http://localhost:3001/session \
  -H "Content-Type: application/json" \
  -d '{"mode":"backtest","symbol":"BTCUSDT","initial_cash":10000,"start_ms":1704067200000,"end_ms":1704074400000}'

# 2) Poll state (advance one candle)
curl http://localhost:3001/state/<SESSION_ID_FROM_STEP_1>

# 3) Send action (buy 50%)
curl -X POST http://localhost:3001/action/<SESSION_ID_FROM_STEP_1> \
  -H "Content-Type: application/json" \
  -d '{"action":"BUY","size_pct":0.5}'
```

### Run server locally
```bash
cd backend
cargo run -p api
```

### CORS / Origins
- Browser calls are allowed from `http://localhost:3000` (Next.js dev). If you serve the frontend from another origin, update the API CORS allowlist accordingly.
