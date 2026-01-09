# Backend Overview (Rust, Offline Backtest)

- Scope: BTCUSDT-only offline backtesting using 1m klines as source of truth; derive higher timeframes (incl. 7-day view) via aggregation.
- Data strategy: download Binance Vision CSV/ZIP for ~2 months, convert to Parquet (snappy), store under `data/spot/BTCUSDT/klines_1m/YYYY-MM.parquet`; keep metadata offsets; optional CSV export for audits.
- Components (workspace): `data-ingest` (download plan + offsets), `feature-engine` (EMA/RSI/CMF), `backtester` (bar-driven with fees/slippage), `llm-agent` (structured action schema), `api` (Axum HTTP), `storage` (FS helpers).
- DataSource: Parquet/FS abstraction planned; current code uses in-memory demo bars while the file pipeline is wired up.
- Outputs: feature frames, LLM decision logs, backtest metrics (PnL, max drawdown, trades, costs); all reproducible from the same FeatureFrame window.
- Full architecture and flows in `backend/BACKEND_RUST_ARCHITECTURE.md`.
- Commands: `just deps` (cargo fetch), `just dev-backend` (cargo run -p api), `just build-backend` (cargo build --workspace), `just test-backend` (cargo test --workspace).
