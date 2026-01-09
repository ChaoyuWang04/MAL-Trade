import json
import time
import urllib.error
import urllib.request
from datetime import datetime

BASE_URL = "http://localhost:3001"
DEFAULT_HEADERS = {"Content-Type": "application/json"}


def log(msg, ok=True):
    prefix = "\033[92m✅" if ok else "\033[91m❌"
    suffix = "\033[0m"
    print(f"{prefix} {msg}{suffix}")


def request(method, path, body=None):
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=data,
        headers=DEFAULT_HEADERS,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_for_health(timeout_sec=60):
    start = time.time()
    while True:
        try:
            resp = request("GET", "/health")
            if resp.get("status") == "ok":
                log("Server healthy")
                return
        except Exception:
            pass
        if time.time() - start > timeout_sec:
            raise RuntimeError("Server not healthy after wait")
        time.sleep(1)


def parse_timestamp(ts_str):
    if ts_str is None:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def verify_backtest():
    payload = {
        "mode": "backtest",
        "symbol": "BTCUSDT",
        "initial_cash": 10000,
        "start_ms": 1704067200000,
        "end_ms": 1704074400000,
    }
    sess = request("POST", "/session", payload)
    session_id = sess["session_id"]
    state1 = request("GET", f"/state/{session_id}")
    t1 = parse_timestamp(state1.get("candle", {}).get("bar", {}).get("close_time"))

    request("POST", f"/action/{session_id}", {"action": "HOLD", "size_pct": 0.0})
    state2 = request("GET", f"/state/{session_id}")
    t2 = parse_timestamp(state2.get("candle", {}).get("bar", {}).get("close_time"))

    if t1 is None or t2 is None or not (t2 > t1):
        raise RuntimeError(f"Backtest time did not advance: t1={t1}, t2={t2}")
    log("Backtest Passed")


def verify_live():
    payload = {"mode": "live", "symbol": "BTCUSDT", "initial_cash": 10000}
    sess = request("POST", "/session", payload)
    session_id = sess["session_id"]
    p1 = None
    deadline = time.time() + 20
    while time.time() < deadline:
        state1 = request("GET", f"/state/{session_id}")
        p1 = state1.get("candle", {}).get("bar", {}).get("close")
        if p1 is not None:
            break
        time.sleep(1)
    if p1 is None:
        raise RuntimeError("Live price missing after waiting for websocket")
    time.sleep(5)
    state2 = request("GET", f"/state/{session_id}")
    p2 = state2.get("candle", {}).get("bar", {}).get("close")
    log(f"Live price samples: p1={p1}, p2={p2}")


def main():
    wait_for_health()
    verify_backtest()
    try:
        verify_live()
    except Exception as e:
        log(f"Live check failed (non-fatal for offline use): {e}", ok=False)


if __name__ == "__main__":
    main()
