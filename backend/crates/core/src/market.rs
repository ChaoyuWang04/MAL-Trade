use async_trait::async_trait;

use crate::FeatureBar;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketMode {
    Backtest,
    Live,
}

#[async_trait]
pub trait MarketSource: Send + Sync {
    async fn next_candle(&mut self) -> Option<FeatureBar>;
    fn mode(&self) -> MarketMode;
}
