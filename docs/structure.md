# Project Structure (Proposed)

目标：固定目录结构，减少跨人修改冲突；前端/后端/合约/共享清晰分工。

状态：目录结构已创建；`frontend/` 与 `backend/` 已初始化基础骨架。

## 顶层结构
```
.
├── AGENTS.md
├── Justfile
├── frontend/                 # 前端（Next.js App Router）
├── backend/                  # 后端（Fastify + WS）
├── contracts/                # 合约（Solidity + 工具链）
├── shared/                   # 前后端共享（schema/types/constants）
├── scripts/                  # 脚本（部署/工具）
└── docs/                      # 项目文档
```

## frontend/（前端）
```
frontend/
├── app/                      # Next.js App Router
│   ├── (public)/             # 公开页面（策略输入）
│   ├── arena/                # 观战页
│   └── api/                  # 可选：Next.js route handlers（若需要）
├── components/               # UI 组件
│   ├── ui/                   # shadcn/ui 生成的组件
│   └── arena/                # Arena 专用组件（图表/卡片/排行）
├── hooks/                    # 前端 hooks
├── lib/                      # 前端工具（format、fetcher、ws client）
├── styles/                   # 全局样式
└── public/                   # 静态资源
```

## backend/（后端）
```
backend/
├── src/
│   ├── api/                  # HTTP routes/controllers
│   ├── ws/                   # WS gateway 与事件广播
│   ├── engine/               # Session/Market/Validator/Execution/Metrics
│   ├── llm/                  # LLM Runner 适配器
│   ├── chain/                # 链上交互（StrategyCommit/LedgerCommit）
│   ├── db/                   # Prisma client + 数据访问
│   ├── config/               # 配置与 env 校验
│   └── shared/               # 仅后端内部共享工具
├── prisma/                   # Prisma schema + migrations
└── tests/                    # 后端测试
```

## contracts/（合约）
```
contracts/
├── src/                      # 合约源码（StrategyCommit/LedgerCommit）
├── script/                   # 部署/交互脚本
├── test/                     # 合约测试
└── artifacts/                # 构建产物（由工具链生成）
```

## shared/（共享）
```
shared/
├── schemas/                  # Zod/OpenAPI schema
├── types/                    # 共享 TypeScript 类型（生成/手写）
└── constants/                # 枚举、reason_code、事件类型
```

## docs/（文档）
```
docs/
├── prd.md
├── trd.md
├── todo.md
└── structure.md
```

## 约定与边界
- **前端只读 shared/**：只能消费 schema/types/constants，不修改生成产物。
- **后端维护 shared/**：schema 变更先在 shared 定义，再同步到前端。
- **合约只在 contracts/**：前后端通过 ABI/地址集成，禁止交叉改动。
- **脚本统一放 scripts/**：部署/数据工具统一管理。
