import websocket
import json
import os

# 1. 代理设置 (如果有需要，取消注释)
# os.environ["http_proxy"] = "http://127.0.0.1:7890"
# os.environ["https_proxy"] = "http://127.0.0.1:7890"

def on_message(ws, message):
    data = json.loads(message)
    # 提取 K 线数据
    k = data['k']
    is_closed = k['x']
    close_price = k['c']
    event_time = data['E']
    
    print(f"⚡ 实时价格: {close_price} {'(K线收盘)' if is_closed else ''}")

def on_error(ws, error):
    print(f"❌ 错误: {error}")

def on_close(ws, close_status_code, close_msg):
    print("🔌 连接断开")

def on_open(ws):
    print("✅ 已连接到 Binance Vision!")

if __name__ == "__main__":
    # 使用 data-stream.binance.vision 而不是 stream.binance.com
    socket = "wss://data-stream.binance.vision/ws/btcusdt@kline_1m"
    
    # 开启调试日志，方便看是不是握手失败
    # websocket.enableTrace(True)
    
    ws = websocket.WebSocketApp(socket,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)

    print(f"正在连接: {socket} ...")
    ws.run_forever()