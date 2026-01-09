# API (Rust Trading Gym)

- **Base URL**: `http://localhost:3001`
- **Auth**: None

## Endpoints

### POST /session
Create a session backed by either historical Parquet (backtest) or live Binance WS (paper).

Request (backtest):
```json
{
  "mode": "backtest",
  "symbol": "BTCUSDT",
  "initial_cash": 10000,
  "start_ms": 1704067200000,
  "end_ms": 1704074400000
}
```

Request (live):
```json
{
  "mode": "live",
  "symbol": "BTCUSDT",
  "initial_cash": 10000
}
```

Response:
```json
{
  "session_id": "uuid-string",
  "mode": "Backtest"
}
```

### GET /state/:id
Advance/read state.
- Backtest: returns the next candle in sequence (time advances per call).
- Live: returns the latest buffered candle (non-blocking).

Response:
```json
{
  "session_id": "...",
  "mode": "Backtest",
  "candle": {
    "bar": {
      "open_time": "2024-01-01T00:00:00Z",
      "close_time": "2024-01-01T00:01:00Z",
      "open": 100.0,
      "high": 101.0,
      "low": 99.0,
      "close": 100.5,
      "volume": 12.3,
      "trades": 123
    },
    "ema_fast": null,
    "ema_slow": null,
    "rsi": null,
    "cmf": null
  },
  "wallet": {
    "cash": 10000.0,
    "position_qty": 0.0,
    "position_avg_price": 0.0,
    "equity": 10000.0,
    "max_drawdown": 0.0
  }
}
```

### POST /action/:id
Apply an action using the current candle price.

Request:
```json
{ "action": "BUY", "size_pct": 0.5 }
```
- `action`: `BUY` | `SELL` | `HOLD`
- `size_pct`: 0.0–1.0 (fraction of cash for BUY, fraction of position for SELL)
- Backtest: consumes the next candle before applying the action (time advances each call).
- Live: uses the latest buffered candle.

Response:
```json
{
  "session_id": "...",
  "wallet": {
    "cash": 9500.0,
    "position_qty": 0.05,
    "position_avg_price": 100.0,
    "equity": 10000.0,
    "max_drawdown": 0.0
  }
}
```

## Troubleshooting
- Prefer `python scripts/test_gym.py` to verify the backend end-to-end. It handles Windows PowerShell escaping issues automatically.
- Ensure the server is running (`cd backend && cargo run -p api`) before running tests.
- Backtest requires Parquet data present under `backend/data/spot/<symbol>/klines_1m/`.
