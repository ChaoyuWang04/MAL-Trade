# TODO Roadmap (Detailed, Role-Split)

目标：基于 PRD + TRD 的全量功能拆解为可并行协作的任务清单，避免交叉修改。
分工维度：Front-end / Back-end / API / Data / Contract / Shared。

---

## Shared（共用资产，避免多人重复）
**Owner：任意 1 人（建议后端）**
- 定义共享目录（建议 `shared/`）：
  - `shared/schemas/`：Zod/OpenAPI schema（请求/响应/WS payload）
  - `shared/constants/`：枚举与 reason_code 常量
  - `shared/types/`：前后端共享 TS types（由 OpenAPI/Schema 生成）
- 明确 Event 类型字典：
  - decision_event / trade_event / reject_event / timeout_event / provider_down_event
- 定义 Session 状态枚举：
  - CREATED / COMMITTED / RUNNING / FINISHED / STOPPED / FAILED
- 定义全局配置项列表（用于 config 文件或 env）：
  - session_duration, bar_interval, intrabar_push, epoch_size, model_timeout
  - market_symbol, max_position_pct, risk_per_trade_pct, allow_short
  - slippage_bps, fee_rate

---

## Data（数据库与数据模型）
**Owner：后端之一**
**Tech：PostgreSQL + Prisma（暂定）**
- 设计 Prisma schema（只包含 MVP 必需字段）：
  - `Session`：session_id, strategy_hash, config_hash, status, start/end, models[], chain_tx_refs
  - `Strategy`：strategy_id, raw_text, risk_params, strategy_hash
  - `Event`：session_id, model_id, bar_index, type, payload_json, timestamp
  - `Snapshot`：session_id, bar_index, model_metrics_json, account_snapshot_json
  - `MarketSnapshot`：session_id, bar_index, ohlc_json, indicators_json
- 约定软删除字段（is_deleted=false）若需要
- 建立最小索引策略（session_id + bar_index + model_id）
- 定义 Replay 必需持久化字段：
  - strategy_text, risk_params, prompt_version, market_snapshots, slippage/fee params
- 写迁移脚本（只生成，不应用到生产）

---

## API（REST + WebSocket 事件定义）
**Owner：后端之一（与 Data 同人或另分）**
**Tech：Fastify + ws**

### REST API（HTTP）
- `POST /sessions`
  - 入参：strategy_text, risk_params, models[], timeframe, bar_interval
  - 出参：session_id, strategy_hash, config_hash, status
- `GET /sessions/:id`
  - 出参：session metadata + status + chain refs
- `GET /sessions/:id/events?from=bar_index`
  - 出参：事件列表（用于断线重连/历史加载）
- `POST /sessions/:id/stop`
  - 触发 STOPPED 状态（安全终止）
- `POST /sessions/:id/replay`
  - 触发 Replay（同策略同时间范围）

### WebSocket 事件（推送）
- `price_update`
  - 当前 bar + intrabar candle 更新
- `event_append`
  - 新事件（decision/trade/reject/timeout/provider_down）
- `metrics_update`
  - 每模型 PnL/DD/position/leaderboard
- `chain_update`
  - StrategyCommit / LedgerCommit tx 状态

### 约束与规范
- 所有 payload 对齐 shared/schemas
- REST 返回与 WS 事件有相同数据结构（避免双维护）
- 禁止前端直接访问数据库

---

## Back-end（交易引擎与 orchestrator）
**Owner：后端之一**
**Tech：Node.js + TypeScript + Fastify + ws**

### Session Engine
- 状态机实现：CREATED → COMMITTED → RUNNING → FINISHED/STOPPED/FAILED
- 生成：
  - strategy_hash
  - config_hash
  - session_id = hash(strategy_hash + config_hash + start_time)
- 触发链上 StrategyCommit（调用 Contract 模块）

### Market Data Service
- 接入交易所 WebSocket Kline（1m）
- intrabar 每秒更新
- bar close 生成 Market Snapshot（不可变）

### LLM Runner
- 统一 Runner 接口（OpenAI / Claude / Gemini / MiniMax）
- 统一 Prompt 模板 + prompt_version
- 强制结构化输出 schema（不符合即 reject）

### Validator
- 规则：Max Position / Risk per Trade / No Short / Cooldown / Drawdown Stop
- 输出 reason_code

### Execution Engine（虚拟盘）
- 市价单执行 + 固定手续费 + 固定滑点
- 维护：cash / position / avg_cost / realized/unrealized PnL

### Metrics & Ledger
- 每 bar 更新 metrics（PnL/回撤/排行）
- 事件写入 DB（Event/Snapshot/MarketSnapshot）
- epoch_root 生成逻辑（rolling hash 或 merkle）
- 触发链上 LedgerCommit（调用 Contract 模块）

### Streamer
- WebSocket 推送 price_update / event_append / metrics_update / chain_update
- 推送节流（1s 或每 bar 合并）

---

## Front-end（TradingView 风格竞技场）
**Owner：前端 1 人**
**Tech：Next.js + Tailwind + shadcn/ui + Framer Motion + Lightweight Charts**

### 策略提交页
- 策略编辑器（文本）
- 风控参数输入（max position / risk / drawdown / allow_short）
- 模型选择（>=3）
- CTA：开始对战（提交后锁定）

### Arena 观战页
- Session Header：status / session_id / strategy_hash / chain tx
- K 线主图：Lightweight Charts + intrabar 更新
- 买卖点 markers：不同模型区分颜色
- 模型卡片列表：PnL / DD / 最新动作 / 状态
- Leaderboard：按 PnL/回撤
- 事件流：时间线 + 点击详情弹窗

### 详情弹窗
- Market Snapshot（OHLC + 指标）
- Decision Struct（结构化）
- Validator Result（PASS/REJECT + reason_code）
- Execution Result（成交价/手续费/滑点）
- Ledger Proof（epoch_root + tx link）

### 状态与数据流
- REST 拉取 session metadata
- WS 订阅实时事件
- 断线重连：用 `GET /sessions/:id/events` 补拉
- 推送节流与 UI 动效（Framer Motion）

---

## Contract（链上承诺）
**Owner：合约 1 人**
**Tech：暂定（Foundry 或 Hardhat，需确认）**

### 合约接口定义
- StrategyCommit：
  - `commitStrategy(session_id, strategy_hash, config_hash, timestamp)`
- LedgerCommit：
  - `commitEpoch(session_id, epoch_index, start_bar, end_bar, ledger_root)`

### 合约实现
- 事件 Event 日志（便于前端查链）
- 只存最小必要字段（避免 gas 膨胀）

### 部署与测试
- 部署到 Moonbeam Moonbase Alpha（测试网）
- 输出合约地址与 ABI
- 提供最小可用脚本（部署 + 写入）

---

## 接口对接协作约定（避免交叉）
- Shared 负责 schema 与 constants，其它模块只引用
- API 先定 schema，再实现 backend，再由 frontend 对接
- Contract 先定 ABI 与 event，再由 backend 接入
- Data 由后端维护，前端不直接改动
