# Backend Overview (Rust, Offline Backtest)

- Scope: BTCUSDT-only offline backtesting using 1m klines as source of truth; derive higher timeframes (incl. 7-day view) via aggregation.
- Data strategy: download Binance Vision CSV/ZIP for ~2 months, convert to Parquet (snappy), store under `data/spot/BTCUSDT/klines_1m/YYYY-MM.parquet`; keep metadata offsets; optional CSV export for audits.
- Components (workspace): `data-ingest` (Binance Vision ZIP downloader + CSV→Parquet via Polars + gap detection), `feature-engine` (EMA/RSI/CMF), `backtester` (bar-driven with fees/slippage), `llm-agent` (structured action schema), `api` (Axum HTTP reading Parquet via `ParquetDataSource`), `storage` (FS helpers).
- DataSource: Parquet/FS backed; API reads slices or latest window from `data/spot/<symbol>/klines_1m/*.parquet`.
- Outputs: feature frames, LLM decision logs, backtest metrics (PnL, max drawdown, trades, costs); all reproducible from the same FeatureFrame window.
- Commands: `just deps` (cargo fetch), `just dev-backend` (cargo run -p api), `just build-backend` (cargo build --workspace), `just test-backend` (cargo test --workspace), `just download-history SYMBOL YEAR MONTH` (run data-ingest download+convert for monthly file; add `--day` via cargo args if needed).
