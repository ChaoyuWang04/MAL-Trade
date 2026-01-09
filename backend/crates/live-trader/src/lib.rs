use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use chrono::{TimeZone, Utc};
use futures::{SinkExt, StreamExt};
use tokio::sync::{Mutex, RwLock};
use tokio_tungstenite::connect_async;
use tracing::{info, warn};
use uuid::Uuid;

use feature_engine::{compute_features, IndicatorConfig};
use mtrade_core::market::{MarketMode, MarketSource};
use mtrade_core::DataSource;
use mtrade_core::{AccountState, FeatureBar};
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
        Self::spawn_ws(symbol.to_string(), latest.clone());
        Self { latest }
    }

    fn spawn_ws(symbol: String, latest: Arc<RwLock<Option<FeatureBar>>>) {
        tokio::spawn(async move {
            let stream_name = format!("{}@kline_1m", symbol.to_lowercase());
            let url = format!("wss://stream.binance.com:9443/ws/{stream_name}");
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
                        warn!(?err, "ws connect failed, retry");
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
