# Rust 后端架构（离线回测版）

> 目标：BTCUSDT 离线回测，基于 1m K 线覆盖约 2 个月历史；存储以 Parquet 为主（可附带 CSV 导出）；暴露 LLM 决策入口与回测管线。暂不做实时 WS，仅预留 DataSource 抽象。

## 1) 范围与基本决策
- 仅现货 BTCUSDT，时间粒度以 1m 为唯一真源，其他周期由聚合得到（含 7 日视图）。
- 数据来源：Binance Vision 下载 ZIP/CSV → 本地转换为 Parquet；无需外部 DB。
- 指标覆盖：基础 OHLCV + EMA（fast/slow 可配）+ RSI + CMF；后续可加 MACD/ATR。
- 模式：纯离线回测（Phase 1），保留 `DataSource` trait 以便 Phase 2 接驳实时。

## 2) 数据策略与目录
- 下载：优先 Binance Vision 批量 ZIP（`.../data/spot/monthly/klines/BTCUSDT/1m/*.zip`），亦可 fallback REST 滚动拉取补缺。
- 转换：Rust CLI 使用 Polars 读 CSV → 写 Parquet（snappy），统一 schema 与时区（UTC）。
- 目录约定：
  - `data/spot/BTCUSDT/klines_1m/YYYY-MM.parquet`（月分桶，便于追加/压缩）
  - `data/spot/BTCUSDT/klines_1m/raw_csv/`（可选保留原始 CSV）
  - `data/spot/BTCUSDT/metadata/offsets.json`（最后覆盖的时间范围、文件列表、校验哈希）
  - 导出接口允许生成 `exports/klines_1m_YYYY-MM.csv` 供审计或模型训练
- 校验：导入时对齐列（open_time, open, high, low, close, volume, close_time, quote_asset_volume, trades, taker_base, taker_quote），过滤重复/交叉。

## 3) 模块划分（workspace）
- `crates/data-ingest`：下载/解压/转换/分桶写 Parquet；维护 offsets；可做缺口扫描。
- `crates/feature-engine`：Polars + `ta/ta-rs`，对 Parquet 读流式处理，生成特征帧。
- `crates/backtester`：bar 驱动撮合（市场价 + 可选固定滑点/手续费），输出 PnL/回撤等。
- `crates/llm-agent`：封装 LLM 提示与输出解析（结构化决策 schema）。
- `crates/api`（可选 Axum/Actix）：
  - `POST /backtests`：提交配置（时间窗、指标集、LLM/规则策略）
  - `GET /backtests/{id}`：状态/结果
  - `GET /features/latest`：最近 N 根特征窗口（便于前端/LLM 调试）
- `crates/storage`（轻量 FS 封装）：路径、分桶、元数据读写。

## 4) DataSource 与管线
- Trait（离线实现）：
  - `fetch_ohlcv(interval: Interval, start: DateTime, end: DateTime) -> Vec<Bar>`：从 Parquet 切片读取，自动补齐空档。
  - `latest_window(n: usize) -> FeatureFrame`：返回最近 N 根特征（供 LLM 输入）。
- 实现：`ParquetDataSource` 直接在 FS 上按月分桶裁剪；预留 `LiveDataSource` 实现（Phase 2）。
- 流程（离线回测）：
  1) `data-ingest backfill --symbol BTCUSDT --interval 1m --months 2`
  2) `feature-engine compute --symbol BTCUSDT --start ... --end ... --indicators ema,rsi,cmf`
  3) `backtester run --config configs/backtest.yaml`（读取已算好的特征 + 策略/LLM 决策）
  4) 输出：回测指标 + 决策/撮合日志（Parquet/JSON）。

## 5) 特征定义（首批）
- Schema（对齐 Polars/Parquet）：`ts`, `open`, `high`, `low`, `close`, `volume`, `ema_fast`, `ema_slow`, `rsi`, `cmf`.
- 7 日视图：从 1m 聚合到 1d，再取近 7 根（或 7d 滑窗）；用于 prompt 提供长周期背景。
- 缺口处理：前向填充/丢弃可配置；聚合时严格按 UTC 对齐，保证与 1m 源一致。

## 6) LLM 集成（离线）
- 输入：最近 N 根 1m 特征 + 7 日聚合摘要 + 账户状态（权益/持仓/可用现金）。
- 输出 schema（结构化 + 解释）：
  - `action: BUY | SELL | HOLD`
  - `size_pct: 0.0~1.0`（资金占比）
  - `note: String`（解释文本，不参与执行）
- 安全：超时/重试，JSON schema 校验，不合规即视为 HOLD 并记录原因。
- 日志：保存 `{features_window, prompt_version, llm_raw, parsed_action, account_snapshot}` 方便复盘。

## 7) Backtester 行为
- 撮合：默认市场价成交价=bar close，支持配置滑点（bps）与手续费（rate）。
- 账户模型：现金、持仓数量、均价、未实现/已实现 PnL、权益、回撤。
- 评估指标：累计 PnL、max drawdown、胜率、交易次数、滑点/手续费成本。
- 对齐：回测使用与 LLM 输出同一 `FeatureFrame` 窗口，确保可复现。

## 8) 运维与演进
- 无 DB：FS + Parquet 即可满足 2 个月 1m 数据（约数百 MB）；未来并发/多标的再接 Postgres/ClickHouse。
- 校验/工具：`data-ingest verify`（查缺口/重复）、`feature-engine sample`（抽样检查特征正确性）。
- Phase 2（预留）：实现 `LiveDataSource`（Binance WS + REST 补偿）、会话状态缓存、WS 推送给前端。
