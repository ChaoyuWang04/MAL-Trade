# TRD：LLM Crypto Trading Arena（路线 B，实时 10min，全自动观战，多模型对战 + 链上可验证）
版本：v1.1（基于已对齐需求）  
面向：4 人黑客松团队（前端强诉求、Web3 新手友好、先完成 MVP）

> 目标：确定最契合需求的技术栈与系统架构，优先保证「好看的 TradingView 风格前端 + 实时 10 分钟对战体验 + 链上可验证承诺」。  
> 免责声明：本项目用于研究与演示，不构成投资建议；默认使用虚拟盘（paper trading），不涉及真实资金自动交易。

---

## 0. 一句话结论（建议直接按这个栈开干）
- **前端**：Next.js（App Router）+ TypeScript + Tailwind + shadcn/ui + Framer Motion + TradingView Lightweight Charts
- **后端**：Node.js（TypeScript）+ Fastify + WebSocket（ws）+ PostgreSQL（Neon/Supabase）
- **行情**：交易所 WebSocket Kline（1m）+ intrabar 实时更新（每秒刷新），10min session 共 10 根 candle（10 次决策点）
- **LLM**：OpenAI / Claude / Gemini / MiniMax（以及你们想加的“Gem”如同源则并入 Gemini）统一 Runner 适配
- **链（波卡生态 EVM）**：Moonbeam 的 Moonbase Alpha 测试网（系统钱包统一发交易）
- **链上内容（最小但硬核）**：StrategyCommit（一次）+ LedgerCommit（分 epoch 批量，多次）

这套组合的目标是：**TradingView 风格够专业、实时观战够爽、链上证明够“能点开看”**，并且团队学习成本最低。

---

## 1. 需求与约束（已对齐）
### 1.1 Session 形态
- 实时行情跑 **10 分钟**
- 一场 session：**所有模型同时参赛**，同策略同数据同节拍
- 用户 **匿名**、不登录
- 用户提交策略后 **不可干预**（只读观战）
- 允许 **Stop（安全终止）**：不改变交易逻辑，只是“拔电源”，防止 API/成本失控

### 1.2 Web3 约束
- **系统钱包统一发交易**（后端签名发送）
- **EVM 兼容链**（降低 Web3 开发难度）

### 1.3 前端诉求
- 偏 **TradingView 专业交易台风格**
- K 线、买卖点、排行榜、事件流要“像真的”

### 1.4 开发命令（Justfile 统一入口）
为避免分散脚本，统一用 `just` 管理各类操作（详见 Justfile）：
- `just deps`：安装依赖
- `just dev`：启动开发环境
- `just build`：构建产物
- `just test`：运行测试
- `just lint`：代码规范检查
- `just deploy`：部署（如已配置）

---

## 2. 核心技术决策（为什么这么选）
### 2.1 为什么节拍用 1m K 线（并且每秒更新 UI）
- 10min 的 demo 用 1m 会产生 **10 次决策点**：节奏清晰、稳定、可解释
- 同时用 **intrabar 每秒更新** 保证画面一直在动：不会像静态 PPT
- 节拍太短会放大 LLM 超时与噪声，增加翻车概率（黑客松不值）

### 2.2 为什么链上采用“epoch 批量承诺”
- 每笔交易都上链：成本/复杂度/失败率都高
- 批量承诺：让链上记录成为“不可篡改的时间戳 + 账本指纹”
- 评委最在乎的是：**能打开 explorer，看见你们承诺了什么，并理解它证明了什么**

**建议链上提交频率（适配 10min 实时 session）：**
- StrategyCommit：开局 1 次
- LedgerCommit：每 2 根 candle（2 分钟）提交 1 次 + 结束时提交 1 次  
  → 10 分钟约 **6 笔链上交易**（可控、可展示、可重试）

---

## 3. 推荐技术栈（最终建议）
### 3.1 前端（重点：好看）
- 框架：Next.js（App Router）+ React + TypeScript
- 样式：Tailwind CSS
- 组件库：shadcn/ui（Radix 基础，质感强）+ lucide-react（图标）
- 动效：Framer Motion（排行榜、卡片状态、事件高亮）
- 数据请求：TanStack Query（缓存与请求状态）
- 全局状态：Zustand（轻量）
- 图表：
  - 行情 K 线：**TradingView Lightweight Charts**（轻、专业、K 线效果强）
  - 指标对比：Recharts（PnL 曲线、回撤、对比小图）

### 3.2 后端（Orchestrator）
- 运行时：Node.js + TypeScript
- Web 框架：Fastify（HTTP）
- 实时推送：WebSocket（ws）
- 定时/节拍：Session Engine（bar close 触发）+ 内置 scheduler
- LLM 适配：统一 Runner 接口（provider plug-in）
- 风控校验：Validator 模块（硬规则）
- 虚拟盘执行：Execution Engine（市价单 + 手续费 + 固定滑点）
- 任务队列（可选，视并发与稳定需求）：
  - BullMQ + Redis（Upstash）用于异步调用与重试
  - **Hackathon 默认可不引入**：并发不高时直接 Promise 并行 + 超时足够

### 3.3 数据存储与对象存储
- 主库：PostgreSQL（Neon / Supabase / Railway Postgres）
- 缓存/消息（可选）：Redis（Upstash）
- 对象存储（可选）：R2/S3，用于导出 session 验证包（日志、证明材料）

### 3.4 合约与链上交互（Polkadot EVM）
- 合约语言：Solidity
- 开发工具：Foundry（推荐，快）或 Hardhat（熟悉者可用）
- EVM 交互库（后端）：viem（推荐）或 ethers v6
- 网络：Moonbeam Moonbase Alpha（测试网）优先；备选 Astar Shibuya

---

## 4. 系统架构（文本版）
系统由四块组成：

1) **前端仪表盘（Next.js）**
- 策略提交页：提交后冻结所有输入
- Arena 观战页：K 线 + 买卖点 markers + 模型列表（watchlist 风格）+ 排行榜 + 事件流
- 交易/决策详情弹窗：展示决策结构体、解释、风控判定、成交、链上 epoch 归属

2) **后端 Orchestrator（Fastify + WS）**
- HTTP API：创建 session / 查询 session / 拉取历史事件
- WebSocket：实时推送价格更新、事件增量、指标与排行榜
- Session Engine：bar close 触发一次“对所有模型的决策流程”

3) **数据库（Postgres）**
- sessions：session 元数据、状态、hash、链上 tx 引用
- events：decision/trade/reject/timeout 等事件日志（审计与前端事件流）
- snapshots/metrics：每 bar 的账户与指标快照（PnL、DD、排名）

4) **链上（Polkadot EVM 测试网）**
- StrategyCommit：承诺策略与运行配置（一次）
- LedgerCommit：承诺交易账本 epoch root（周期性批量）

---

## 5. 前端设计落地（TradingView 风格要点）
### 5.1 页面布局建议
- **顶部状态条**：Session 状态（RUNNING/FINISHED）、倒计时、策略 hash、链上 tx chips（可点击打开 explorer）
- **主图区域（左）**：K 线图（Lightweight Charts）
  - intrabar 每秒更新当前 candle
  - 叠加多模型 markers（买/卖/拒单/超时）
- **侧栏区域（右）**：模型卡片列表（像 TradingView watchlist）
  - 大数字：PnL、最大回撤、当前仓位比例
  - 最新动作：BUY/SELL/HOLD + 一行解释摘要
  - 状态：RUNNING / TIMEOUT / FAILED
- **底部事件流**：像 time&sales
  - 点击事件 → 打开详情弹窗（审计感）

### 5.2 “好看”细节（强建议）
- 排行榜名次变化有平滑动画（Framer Motion layout）
- 新事件出现轻微高亮并快速衰减（不刺眼）
- markers 风格克制统一（TradingView 风格是“少而准”）
- 事件流使用虚拟列表（防止卡顿）
- WS 推送节流：每秒/每 bar 合并推送（避免前端抖动）

---

## 6. 后端执行引擎设计（实时 10min）
### 6.1 Session 生命周期
状态机：CREATED → COMMITTED → RUNNING → FINISHED/STOPPED/FAILED

- **CREATED**：用户填写策略与参数
- **COMMITTED**：生成 strategy_hash/config_hash/session_id；提交 StrategyCommit 上链；冻结策略
- **RUNNING**：订阅行情；每个 bar close 执行一次交易 tick
- **FINISHED**：到 10min 自动结束（或触发回撤止损）
- **STOPPED**：用户安全终止（仍保留审计日志）
- **FAILED**：行情源/模型 API/链上交互异常导致不可继续

### 6.2 交易 tick（每分钟一次）流水线
1. 固化 Market Snapshot（该 candle close 的 OHLC + 可选指标摘要）
2. 并行调用所有模型生成决策（结构化 + 解释）
3. Validator 硬风控校验（PASS/REJECT + reason_code）
4. Execution 虚拟盘成交（仅 MARKET，固定手续费+滑点）
5. Metrics 更新（PnL、回撤、仓位、排行）
6. 写 DB（events、snapshots）
7. WebSocket 推送前端：价格增量 + 事件增量 + 排名更新
8. 若达到 epoch 边界：构建 epoch_root 并链上 LedgerCommit

### 6.3 并行与超时策略（必须做，否则容易翻车）
- 单模型超时：本 tick 对该模型视为 HOLD + 记录 TIMEOUT 事件（UI 可见）
- provider 全局故障：该 provider 全部模型改为 HOLD，并标红“Provider Down”
- 绝不让一个模型的超时阻塞其它模型执行

---

## 7. LLM Runner（统一适配层）
### 7.1 支持的 providers（你们的清单）
- OpenAI
- Claude（Anthropic）
- Gemini（Google）
- MiniMax
- “Gem”（如与 Gemini 同源可并入；若是独立 provider 则作为一个新的 runner）

### 7.2 输入输出统一（核心：可执行、可比较）
输入（每 tick）：
- 固定 Prompt 模板（系统/开发者指令恒定）
- 用户策略文本（冻结，不变）
- 当前 market snapshot（固定数据）
- 当前账户状态摘要（现金、仓位、权益、回撤）

输出（必须）：
- **结构化决策**（严格 schema，不符合即拒绝）
- 解释文本（仅展示，不参与执行）

### 7.3 结构化决策 schema（概念级）
- action：BUY / SELL / HOLD
- symbol：BTC/USDT（白名单）
- order_type：MARKET（MVP 固定）
- size_pct：0.0 ~ 1.0（占可用资金比例）
- rationale：解释（可读）
- constraints_ack：确认风控不可覆盖（审计用）

> 系统只执行结构化部分；解释只用于 UI 展示。

---

## 8. Validator（硬风控：真正的交易员）
### 8.1 建议默认风控（可配置）
- Max Position %（默认 30%）
- Risk per Trade %（默认 1%）
- Min Trade Interval（默认 1 bar）
- No Short（默认 true）
- Max Drawdown Stop（默认 20%）

### 8.2 标准化拒单原因（reason_code）
- SCHEMA_INVALID
- TIMEOUT
- MAX_POSITION
- RISK_LIMIT
- NO_SHORT
- COOLDOWN
- DRAWDOWN_STOP
- PROVIDER_DOWN
- INTERNAL_ERROR

> 前端必须显示 reason_code：这能显著提升“工程可信度”。

---

## 9. Execution Engine（虚拟盘，演示优先稳）
### 9.1 为什么先只做市价单
- 边界条件少：不需要撮合、不需要盘口深度
- 10min demo 强调“行为差异”而不是“交易技巧”

### 9.2 成交模型（建议）
- 成交价：使用 candle close 或 mid（固定一种并写入配置）
- 滑点：固定 bps（例如 5–10 bps）
- 手续费：固定费率（例如 0.05%）
- 记账：现金、持仓数量、均价、已实现/未实现 PnL、权益曲线、回撤

---

## 10. 数据存储（概念级）
### 10.1 最小表集合
- sessions：session_id、strategy_hash、config_hash、status、start/end、providers/models、chain_tx_refs
- events：
  - decision_event（model_id、bar_index、decision_struct、explanation、validation_result）
  - trade_event（fill_price、qty、fee、slippage、position_snapshot、account_snapshot）
  - reject_event（reason_code）
  - timeout_event / provider_down_event
- metrics_snapshots：bar_index、per_model_metrics（PnL、DD、position）

### 10.2 Replay（重放）
为了可复现，至少保存：
- 策略原文 + 风控参数 + prompt_version
- 每分钟 bar close 的 market snapshot（10 条）
- 滑点/手续费参数（固定）
Replay：用保存的 snapshots 重跑，结果应一致（或在可解释范围内一致）。

---

## 11. 链上部分（Polkadot EVM：系统钱包发交易）
### 11.1 网络选择
- 推荐：Moonbeam Moonbase Alpha（测试网）
- 备选：Astar Shibuya（测试网）

### 11.2 合约最小接口（不写代码，只定行为）
**StrategyCommit**
- commitStrategy(session_id, strategy_hash, config_hash, timestamp)

**LedgerCommit**
- commitEpoch(session_id, epoch_index, start_bar, end_bar, ledger_root)

### 11.3 ledger_root 构建规则（审计友好）
- epoch 内事件按（bar_index、model_id、event_type、timestamp）排序
- 每条事件生成 event_hash
- epoch_root：
  - MVP：rolling hash（更快更稳）
  - 加分：Merkle root（可做 membership proof 展示）

---

## 12. 部署与环境（Hackathon 友好）
- 前端：Vercel
- 后端：Railway / Render / Fly.io（三选一，按团队熟悉度）
- DB：Neon 或 Supabase
- Secrets：LLM keys、系统钱包私钥（仅后端环境变量）
- 观测：
  - 最少：结构化日志（每 tick 一条 summary）
  - 可选：Sentry（前端错误上报）

---

## 13. 建议运行参数（可直接写进 config）
- session_duration：10m
- bar_interval：1m
- intrabar_push：1s（每秒推一次最新价格/当前 candle）
- epoch_size：2 bars（2m）
- model_timeout：2–4s（按 provider 调整）
- market_symbol：BTCUSDT（先单标的最稳）
- max_position_pct：30%
- risk_per_trade_pct：1%
- allow_short：false
- slippage_bps：5–10
- fee_rate：0.05%（示例）

---

## 14. 主要风险与应对（非常现实）
1) **LLM 超时/抽风** → schema 强校验 + timeout=HOLD + UI 可见  
2) **行情源抖动/断线** → 断线重连；bar close 以交易所 Kline close 为准  
3) **链上交易失败** → 不阻塞主流程；UI 标记 pending/failed；后台重试  
4) **前端卡顿（事件流过密）** → 虚拟列表 + WS 推送节流/合并  
5) **成本爆炸（LLM 调用多）** → 严格 1m tick、严格 session 10m、限制模型数量与超时

---

## 15. 里程碑（以“好看且能跑”为第一优先级）
- M1（2–4h）：前端 TradingView K 线跑起来（先假数据也行）
- M2（4–8h）：后端 session engine + WS 推送 + 单模型闭环
- M3（8–16h）：多模型并行 + Validator + 虚拟盘执行 + 排行榜
- M4（16–24h）：合约部署 + StrategyCommit + epoch LedgerCommit + 前端 ProofPanel 展示 tx
- M5（最后）：防翻车（timeout/断线/失败可见）+ Demo 脚本（10min 真实跑一场）

---

## 16. Demo 叙事（让评委一秒懂）
“同一策略、同一行情、同一风控下，多个模型做出了不同的交易人格；我们把策略指纹和账本指纹写到波卡生态链上，证明结果不可篡改。”
