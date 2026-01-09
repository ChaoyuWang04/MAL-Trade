# TODO Roadmap (Phased)

目标：覆盖 PRD/TRD 全量功能，按阶段交付可演示成果，并确保链上承诺可验证。

## Phase 0 — 基础与脚手架（Day 0）
- 明确目录结构（frontend/backend/contracts/docs）
- 落地 `Justfile` 统一命令入口（deps/dev/build/test/lint/deploy）
- 环境变量规范（LLM keys、DB、链上钱包私钥）
- 选定部署目标（前端 Vercel；后端 Railway/Render/Fly；DB Neon/Supabase）

## Phase 1 — 后端最小闭环（MVP Engine）
- Session 状态机：CREATED → COMMITTED → RUNNING → FINISHED/STOPPED/FAILED
- Market Data：1m Kline + intrabar 1s 刷新
- LLM Runner：统一 schema 输出（action/symbol/order_type/size_pct/constraints_ack）
- Validator：硬风控规则 + reason_code
- Execution Engine：虚拟盘市价单、手续费、滑点
- Metrics：PnL/回撤/持仓/排行
- 事件日志：decision/trade/reject/timeout/provider_down
- WebSocket 推送：价格、事件、指标增量

## Phase 2 — 前端竞技场（TradingView 风格）
- 策略提交页：策略 + 风控参数 + 模型选择
- Arena 页：K 线 + 买卖点 markers + 模型卡片 + 排行榜 + 事件流
- 详情弹窗：market snapshot + decision struct + validator 结果 + execution 结果
- UI 细节：排行榜动效、事件高亮、节流推送

## Phase 3 — 链上承诺闭环（Polkadot EVM）
- 合约：StrategyCommit + LedgerCommit（Solidity）
- 后端链交互：viem/ethers v6，系统钱包统一签名
- epoch 规则：每 2 根 candle + 结束时提交
- 前端 ProofPanel：tx 链接、epoch_root、状态

## Phase 4 — 可复现与稳定性
- Replay：保存策略/风控/market snapshots/滑点参数
- LLM 超时与降级：timeout=HOLD + 事件可见
- 行情断线重连策略（不中断主流程）
- 观测：结构化日志 + Sentry（可选）

## Phase 5 — Demo 叙事与验收
- 10min 真实跑一场（含至少 1 次 LedgerCommit）
- 验收项对齐 PRD DoD：
  - 策略锁定 + strategy_hash
  - Arena 实时更新
  - 链上承诺可查
  - Stop/Replay 可用
- Demo 脚本：同策略不同模型的行为差异 + 链上证明
