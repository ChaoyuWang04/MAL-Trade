# Backend Overview (Rust, Offline Backtest)

- Scope: BTCUSDT-only offline backtesting using 1m klines as source of truth; derive higher timeframes (incl. 7-day view) via aggregation.
- Data strategy: download Binance Vision CSV/ZIP for ~2 months, convert to Parquet (snappy), store under `data/spot/BTCUSDT/klines_1m/YYYY-MM.parquet`; keep metadata offsets; optional CSV export for audits.
- Components (workspace): `data-ingest` (download/convert), `feature-engine` (Polars + ta/ta-rs indicators EMA/RSI/CMF), `backtester` (bar-driven with fees/slippage), `llm-agent` (structured action schema), `api` (Axum/Actix optional), `storage` (FS helpers).
- DataSource: `ParquetDataSource` for offline reads; trait prepped for future `LiveDataSource` without implementing WS now.
- Outputs: feature frames, LLM decision logs, backtest metrics (PnL, max drawdown, trades, costs); all reproducible from the same FeatureFrame window.
- Full architecture and flows in `backend/BACKEND_RUST_ARCHITECTURE.md`.
