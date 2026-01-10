import urllib.request
import json
import time
import datetime
import os

# 1. 强制走代理 (如果你有 clash，把下面这两行的注释取消掉)
# os.environ["HTTP_PROXY"] = "http://127.0.0.1:7890"
# os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7890"

# 2. 使用 Binance Vision (官方公共数据源，比主站好连)
BASE_URL = "https://data-api.binance.vision/api/v3/klines"
SYMBOL = "BTCUSDT"
INTERVAL = "1m"

def get_latest_price():
    url = f"{BASE_URL}?symbol={SYMBOL}&interval={INTERVAL}&limit=1"
    try:
        req = urllib.request.Request(url)
        # 伪装一下 User-Agent，防止被拦截
        req.add_header('User-Agent', 'Mozilla/5.0')
        
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            # K线数据格式: [Open Time, Open, High, Low, Close, Volume, ...]
            latest = data[0]
            price = float(latest[4]) # Close price
            return price
    except Exception as e:
        print(f"⚠️ 连接失败: {e}")
        return None

def main():
    print(f"🚀 开始从 Binance Vision 获取 {SYMBOL} 数据...")
    print(f"📡 目标接口: {BASE_URL}")
    
    last_price = 0
    while True:
        price = get_latest_price()
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        
        if price:
            color = "🟢" if price >= last_price else "🔴"
            print(f"[{timestamp}] {color} BTC: {price:.2f}")
            last_price = price
        else:
            print(f"[{timestamp}] 💤 暂无数据 (请检查代理)")
            
        time.sleep(1) # 1秒刷一次

if __name__ == "__main__":
    main()