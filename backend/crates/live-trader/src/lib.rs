use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use chrono::{TimeZone, Utc};
use futures::{SinkExt, StreamExt};
use reqwest::Client;
use tokio::sync::{Mutex, RwLock};
use tokio_tungstenite::connect_async;
use tracing::{info, warn};
use uuid::Uuid;

use feature_engine::{compute_features, IndicatorConfig};
use mtrade_core::market::{MarketMode, MarketSource};
use mtrade_core::DataSource;
use mtrade_core::{AccountState, FeatureBar, Order, OrderType};
use storage::{DataPaths, ParquetDataSource};

pub struct BacktestSource {
    cursor: usize,
    frames: Vec<FeatureBar>,
}

impl BacktestSource {
    pub fn new(frames: Vec<FeatureBar>) -> Self {
        Self { cursor: 0, frames }
    }
}

#[async_trait]
impl MarketSource for BacktestSource {
    async fn next_candle(&mut self) -> Option<FeatureBar> {
        if self.cursor >= self.frames.len() {
            return None;
        }
        let item = self.frames[self.cursor].clone();
        self.cursor += 1;
        Some(item)
    }

    fn mode(&self) -> MarketMode {
        MarketMode::Backtest
    }
}

pub struct LiveSource {
    latest: Arc<RwLock<Option<FeatureBar>>>,
}

impl LiveSource {
    pub fn new(symbol: &str, seed: Option<FeatureBar>) -> Self {
        let latest = Arc::new(RwLock::new(None));
        if let Some(fb) = seed {
            let mut lock = futures::executor::block_on(latest.write());
            *lock = Some(fb);
        }
        Self::spawn_ws_or_poll(symbol.to_string(), latest.clone());
        Self { latest }
    }

    fn spawn_ws_or_poll(symbol: String, latest: Arc<RwLock<Option<FeatureBar>>>) {
        tokio::spawn(async move {
            let stream_name = format!("{}@kline_1m", symbol.to_lowercase());
            let url = format!("wss://data-stream.binance.vision/ws/{stream_name}");
            loop {
                match connect_async(&url).await {
                    Ok((ws_stream, _)) => {
                        info!(%url, "ws connected");
                        let (mut write, mut read) = ws_stream.split();
                        // send ping loop
                        let ping = tokio::spawn(async move {
                            loop {
                                if write
                                    .send(tokio_tungstenite::tungstenite::Message::Ping(vec![]))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                            }
                        });

                        while let Some(msg) = read.next().await {
                            match msg {
                                Ok(tokio_tungstenite::tungstenite::Message::Text(txt)) => {
                                    if let Ok(parsed) =
                                        serde_json::from_str::<serde_json::Value>(&txt)
                                    {
                                        if let Some(k) = parsed.get("k") {
                                            if let (
                                                Some(open_time),
                                                Some(close_time),
                                                Some(open),
                                                Some(high),
                                                Some(low),
                                                Some(close),
                                                Some(volume),
                                            ) = (
                                                k.get("t").and_then(|v| v.as_i64()),
                                                k.get("T").and_then(|v| v.as_i64()),
                                                k.get("o")
                                                    .and_then(|v| v.as_str())
                                                    .and_then(|s| s.parse::<f64>().ok()),
                                                k.get("h")
                                                    .and_then(|v| v.as_str())
                                                    .and_then(|s| s.parse::<f64>().ok()),
                                                k.get("l")
                                                    .and_then(|v| v.as_str())
                                                    .and_then(|s| s.parse::<f64>().ok()),
                                                k.get("c")
                                                    .and_then(|v| v.as_str())
                                                    .and_then(|s| s.parse::<f64>().ok()),
                                                k.get("v")
                                                    .and_then(|v| v.as_str())
                                                    .and_then(|s| s.parse::<f64>().ok()),
                                            ) {
                                                let bar = mtrade_core::Bar {
                                                    open_time: Utc
                                                        .timestamp_millis_opt(open_time)
                                                        .single()
                                                        .unwrap_or_else(|| Utc::now()),
                                                    close_time: Utc
                                                        .timestamp_millis_opt(close_time)
                                                        .single()
                                                        .unwrap_or_else(|| Utc::now()),
                                                    open,
                                                    high,
                                                    low,
                                                    close,
                                                    volume,
                                                    trades: k
                                                        .get("n")
                                                        .and_then(|v| v.as_u64())
                                                        .unwrap_or(0),
                                                };
                                                let fb = FeatureBar {
                                                    bar,
                                                    ema_fast: None,
                                                    ema_slow: None,
                                                    rsi: None,
                                                    cmf: None,
                                                };
                                                let mut lock = latest.write().await;
                                                *lock = Some(fb);
                                                info!(price=%close, "Received WebSocket Tick");
                                            }
                                        }
                                    }
                                }
                                Ok(_) => {}
                                Err(err) => {
                                    warn!(?err, "ws read error");
                                    break;
                                }
                            }
                        }
                        ping.abort();
                        warn!("ws disconnected, retrying");
                    }
                    Err(err) => {
                        warn!(?err, "ws connect failed, fallback to HTTP poll");
                        if let Err(pe) = poll_once_http(&symbol, &latest).await {
                            warn!(?pe, "http poll failed");
                        }
                    }
                }
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        });
    }
}

#[async_trait]
impl MarketSource for LiveSource {
    async fn next_candle(&mut self) -> Option<FeatureBar> {
        let guard = self.latest.read().await;
        guard.clone()
    }

    fn mode(&self) -> MarketMode {
        MarketMode::Live
    }
}

pub struct Session {
    pub id: Uuid,
    pub source: Box<dyn MarketSource>,
    pub wallet: AccountState,
    pub history: Vec<String>,
}

impl Session {
    pub fn new(id: Uuid, source: Box<dyn MarketSource>, initial_cash: f64) -> Self {
        Self {
            id,
            source,
            wallet: AccountState::flat(initial_cash),
            history: Vec::new(),
        }
    }

    pub fn check_fills(&mut self, candle: &FeatureBar) {
        const FEE_RATE: f64 = 0.001;
        let mut filled = Vec::new();
        for (idx, order) in self.wallet.open_orders.iter().enumerate() {
            match order.side {
                mtrade_core::ActionSide::Buy => {
                    if candle.bar.low <= order.price {
                        let fee = order.price * order.quantity * FEE_RATE;
                        // cash 已在下单时锁定
                        self.wallet.cash -= fee;
                        // 更新均价
                        let total_cost_existing =
                            self.wallet.position_avg_price * self.wallet.position_qty;
                        let total_cost_new = order.price * order.quantity;
                        let new_qty = self.wallet.position_qty + order.quantity;
                        self.wallet.position_avg_price = if new_qty > 0.0 {
                            (total_cost_existing + total_cost_new) / new_qty
                        } else {
                            0.0
                        };
                        self.wallet.position_qty = new_qty;
                        filled.push(idx);
                    }
                }
                mtrade_core::ActionSide::Sell => {
                    if candle.bar.high >= order.price {
                        let notional = order.price * order.quantity;
                        let fee = notional * FEE_RATE;
                        self.wallet.cash += notional - fee;
                        // 头寸已在下单时锁定扣减
                        filled.push(idx);
                    }
                }
                mtrade_core::ActionSide::Hold => {}
            }
        }
        // 从后往前移除，避免索引错位
        for idx in filled.into_iter().rev() {
            self.wallet.open_orders.remove(idx);
        }
        self.recalc_equity(candle.bar.close);
    }

    pub fn apply_action(
        &mut self,
        side: mtrade_core::ActionSide,
        size_pct: f64,
        order_type: OrderType,
        price: Option<f64>,
        order_id: Option<&str>,
        last_price: Option<f64>,
    ) {
        const FEE_RATE: f64 = 0.001;
        let now = Utc::now().timestamp_millis();
        // 先处理取消
        if let Some(cancel_id) = order_id {
            if let Some(pos) = self
                .wallet
                .open_orders
                .iter()
                .position(|o| o.id == cancel_id)
            {
                let order = self.wallet.open_orders.remove(pos);
                match order.side {
                    mtrade_core::ActionSide::Buy => {
                        self.wallet.cash += order.price * order.quantity;
                    }
                    mtrade_core::ActionSide::Sell => {
                        self.wallet.position_qty += order.quantity;
                    }
                    _ => {}
                }
            }
            return;
        }

        match order_type {
            OrderType::Market => {
                if let Some(ref_price) = last_price {
                    match side {
                        mtrade_core::ActionSide::Buy => {
                            let spend = self.wallet.cash * size_pct;
                            if spend > 0.0 && ref_price > 0.0 {
                                let qty = spend / ref_price;
                                let fee = spend * FEE_RATE;
                                self.wallet.cash -= spend + fee;
                                let total_cost_existing =
                                    self.wallet.position_avg_price * self.wallet.position_qty;
                                let new_qty = self.wallet.position_qty + qty;
                                self.wallet.position_avg_price = if new_qty > 0.0 {
                                    (total_cost_existing + spend) / new_qty
                                } else {
                                    0.0
                                };
                                self.wallet.position_qty = new_qty;
                            }
                        }
                        mtrade_core::ActionSide::Sell => {
                            let qty = self.wallet.position_qty * size_pct;
                            if qty > 0.0 {
                                let proceeds = qty * ref_price;
                                let fee = proceeds * FEE_RATE;
                                self.wallet.cash += proceeds - fee;
                                self.wallet.position_qty -= qty;
                                if self.wallet.position_qty <= f64::EPSILON {
                                    self.wallet.position_avg_price = 0.0;
                                    self.wallet.position_qty = 0.0;
                                }
                            }
                        }
                        mtrade_core::ActionSide::Hold => {}
                    }
                    self.recalc_equity(ref_price);
                }
            }
            OrderType::Limit => {
                let price = match price {
                    Some(p) => p,
                    None => return,
                };
                match side {
                    mtrade_core::ActionSide::Buy => {
                        let spend = self.wallet.cash * size_pct;
                        if spend > 0.0 && price > 0.0 {
                            let qty = spend / price;
                            self.wallet.cash -= spend;
                            self.wallet.open_orders.push(Order {
                                id: Uuid::new_v4().to_string(),
                                side,
                                order_type: OrderType::Limit,
                                price,
                                quantity: qty,
                                created_at: now,
                            });
                        }
                    }
                    mtrade_core::ActionSide::Sell => {
                        let qty = self.wallet.position_qty * size_pct;
                        if qty > 0.0 {
                            self.wallet.position_qty -= qty;
                            self.wallet.open_orders.push(Order {
                                id: Uuid::new_v4().to_string(),
                                side,
                                order_type: OrderType::Limit,
                                price,
                                quantity: qty,
                                created_at: now,
                            });
                        }
                    }
                    mtrade_core::ActionSide::Hold => {}
                }
                if let Some(p) = last_price {
                    self.recalc_equity(p);
                }
            }
        }
    }

    fn recalc_equity(&mut self, mark_price: f64) {
        let position_value = self.wallet.position_qty * mark_price;
        self.wallet.equity = self.wallet.cash + position_value;
        // max_drawdown 简化：不变或按初始现金计算
    }
}

#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<HashMap<Uuid, Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_backtest(
        &self,
        symbol: &str,
        data_paths: DataPaths,
        start_ms: i64,
        end_ms: i64,
        initial_cash: f64,
    ) -> Result<Uuid> {
        let source = ParquetDataSource::new(data_paths);
        let bars = source.fetch_ohlcv(
            chrono::Utc.timestamp_millis_opt(start_ms).unwrap(),
            chrono::Utc.timestamp_millis_opt(end_ms).unwrap(),
        )?;
        let frame = compute_features(symbol.to_string(), &bars, IndicatorConfig::default())?;
        let fb = frame.rows;
        let mut map = self.inner.lock().await;
        let id = Uuid::new_v4();
        map.insert(
            id,
            Session::new(id, Box::new(BacktestSource::new(fb)), initial_cash),
        );
        Ok(id)
    }

    pub async fn create_live(
        &self,
        initial_cash: f64,
        symbol: &str,
        seed: Option<FeatureBar>,
    ) -> Result<Uuid> {
        let mut map = self.inner.lock().await;
        let id = Uuid::new_v4();
        map.insert(
            id,
            Session::new(id, Box::new(LiveSource::new(symbol, seed)), initial_cash),
        );
        Ok(id)
    }

    pub async fn with_session<F, R>(&self, id: Uuid, mut f: F) -> Result<R>
    where
        F: FnMut(&mut Session) -> Result<R>,
    {
        let mut map = self.inner.lock().await;
        let session = map
            .get_mut(&id)
            .ok_or_else(|| anyhow::anyhow!("session not found"))?;
        f(session)
    }
}

async fn poll_once_http(symbol: &str, latest: &Arc<RwLock<Option<FeatureBar>>>) -> Result<()> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let url = format!(
        "https://data-api.binance.vision/api/v3/klines?symbol={}&interval=1m&limit=1",
        symbol
    );
    let resp = client
        .get(url)
        .header("User-Agent", "mtrade")
        .send()
        .await?;
    let arr: serde_json::Value = resp.json().await?;
    if let Some(latest_arr) = arr.as_array().and_then(|a| a.get(0)) {
        if let Some(close) = latest_arr.get(4).and_then(|v| v.as_str()) {
            let close_f = close.parse::<f64>().unwrap_or(0.0);
            let open_time = latest_arr.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let close_time = latest_arr
                .get(6)
                .and_then(|v| v.as_i64())
                .unwrap_or(open_time + 60_000);
            let bar = mtrade_core::Bar {
                open_time: Utc
                    .timestamp_millis_opt(open_time)
                    .single()
                    .unwrap_or_else(|| Utc::now()),
                close_time: Utc
                    .timestamp_millis_opt(close_time)
                    .single()
                    .unwrap_or_else(|| Utc::now()),
                open: latest_arr
                    .get(1)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(close_f),
                high: latest_arr
                    .get(2)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(close_f),
                low: latest_arr
                    .get(3)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(close_f),
                close: close_f,
                volume: latest_arr
                    .get(5)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0.0),
                trades: latest_arr.get(8).and_then(|v| v.as_u64()).unwrap_or(0),
            };
            let fb = FeatureBar {
                bar,
                ema_fast: None,
                ema_slow: None,
                rsi: None,
                cmf: None,
            };
            let mut lock = latest.write().await;
            *lock = Some(fb);
            info!(price = close_f, "http poll latest price set");
        }
    }
    Ok(())
}
