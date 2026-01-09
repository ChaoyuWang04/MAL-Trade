use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub type Symbol = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bar {
    pub open_time: DateTime<Utc>,
    pub close_time: DateTime<Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub trades: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureBar {
    pub bar: Bar,
    pub ema_fast: Option<f64>,
    pub ema_slow: Option<f64>,
    pub rsi: Option<f64>,
    pub cmf: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFrame {
    pub symbol: Symbol,
    pub rows: Vec<FeatureBar>,
}

impl FeatureFrame {
    pub fn latest_window(&self, n: usize) -> Self {
        let total = self.rows.len();
        let start = total.saturating_sub(n);
        Self {
            symbol: self.symbol.clone(),
            rows: self.rows[start..].to_vec(),
        }
    }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub enum ActionSide {
    Buy,
    Sell,
    Hold,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub id: Uuid,
    pub symbol: Symbol,
    pub side: ActionSide,
    pub size_pct: f64,
    pub note: Option<String>,
}

impl Action {
    pub fn new(symbol: Symbol, side: ActionSide, size_pct: f64, note: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            symbol,
            side,
            size_pct,
            note,
        }
    }

    pub fn validate(&self) -> Result<(), ValidationError> {
        if !(0.0..=1.0).contains(&self.size_pct) {
            return Err(ValidationError::SizeOutOfRange(self.size_pct));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountState {
    pub cash: f64,
    pub position_qty: f64,
    pub position_avg_price: f64,
    pub equity: f64,
    pub max_drawdown: f64,
}

impl AccountState {
    pub fn flat(cash: f64) -> Self {
        Self {
            cash,
            position_qty: 0.0,
            position_avg_price: 0.0,
            equity: cash,
            max_drawdown: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeEvent {
    pub bar_time: DateTime<Utc>,
    pub action: ActionSide,
    pub fill_price: f64,
    pub qty: f64,
    pub fee_paid: f64,
    pub slippage_bps: f64,
    pub resulting_state: AccountState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub symbol: Symbol,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub initial_cash: f64,
    pub final_state: AccountState,
    pub trades: Vec<TradeEvent>,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct WindowSpec {
    pub duration: Duration,
    pub bars: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmInput {
    pub features: FeatureFrame,
    pub recent_account: AccountState,
}

pub trait DataSource {
    fn fetch_ohlcv(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Bar>, DataSourceError>;

    fn latest_window(&self, n: usize) -> Result<Vec<Bar>, DataSourceError>;
}

#[derive(Debug, Error)]
pub enum DataSourceError {
    #[error("io: {0}")]
    Io(String),
    #[error("data gap detected between {start} and {end}")]
    DataGap {
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    },
    #[error("invalid range: start >= end")]
    InvalidRange,
    #[error("other: {0}")]
    Other(String),
}

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("size_pct out of range: {0}")]
    SizeOutOfRange(f64),
}

pub mod market;
