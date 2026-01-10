# Backend Data & API Guide (Rust Gym)

本指南只覆盖「数据获取」与「接口调用」，不包含任何本地数据文件；仓库不会上传 Parquet/CSV。

## 1) 数据下载与转换（Binance Vision → Parquet）
- 命令：在 `backend/` 目录运行
  ```bash
  cargo run -p data-ingest -- --symbol BTCUSDT ingest --year 2024 --month 1
  # 可选：日级文件
  # cargo run -p data-ingest -- --symbol BTCUSDT ingest --year 2024 --month 1 --day 05
  ```
- 行为：下载 `data.binance.vision` 的 ZIP → 解压 CSV → 转 Parquet → 存放到：
  - `backend/data/spot/<SYMBOL>/klines_1m/YYYY-MM.parquet`
  - 元数据：`backend/data/spot/<SYMBOL>/metadata/offsets.json`
- 代理：如需代理（Clash 7890），请开启系统全局/TUN，或自行配置网络环境；程序本身不内置代理。

## 2) 启动 API
```bash
cd backend
cargo run -p api
# 默认监听 0.0.0.0:3001
```

## 3) 接口速览
- Base URL: `http://localhost:3001`
- Auth: 无

### 3.1 创建 Session
`POST /session`
```json
// 回测示例
{
  "mode": "backtest",
  "symbol": "BTCUSDT",
  "initial_cash": 10000,
  "start_ms": 1704067200000,
  "end_ms":   1704074400000
}
// 实时示例（需网络可连 Binance WS）
{
  "mode": "live",
  "symbol": "BTCUSDT",
  "initial_cash": 10000
}
```
响应：
```json
{ "session_id": "uuid", "mode": "Backtest" }
```

### 3.2 获取状态
`GET /state/:id`
- 回测：返回下一根 K 线；调用一次时间前进一次。
- 实时：返回最新缓冲的 K 线（若 WS 未连上可能为空）。
响应示例：
```json
{
  "session_id": "...",
  "mode": "Backtest",
  "candle": {
    "bar": {
      "open_time": "2024-01-01T00:00:00Z",
      "close_time": "2024-01-01T00:01:00Z",
      "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.5,
      "volume": 12.3, "trades": 123
    },
    "ema_fast": null, "ema_slow": null, "rsi": null, "cmf": null
  },
  "wallet": {
    "cash": 10000.0, "position_qty": 0.0,
    "position_avg_price": 0.0, "equity": 10000.0, "max_drawdown": 0.0
  }
}
```

### 3.3 下发动作
`POST /action/:id`
```json
{ "action": "BUY", "size_pct": 0.5 }
```
- `action`: `BUY` | `SELL` | `HOLD`
- `size_pct`: 0~1，BUY 表示使用现金比例，SELL 表示卖出持仓比例。
响应：
```json
{ "session_id": "...", "wallet": { ...最新账户快照... } }
```

## 4) 最小验证脚本（已有）
- `scripts/test_gym.py`：自动健康检查、回测校验、实时校验（依赖 WS 可用）。
  ```bash
  python scripts/test_gym.py
  ```

## 5) 常见问题
- 数据不会随仓库上传，需自行运行 data-ingest。
- 实时模式依赖 Binance WebSocket；若网络受限需开启代理/TUN。
- 回测模式只要 Parquet 在本地即可运行，不依赖网络。
