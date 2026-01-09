use anyhow::Result;
use core::{AccountState, Action, ActionSide, BacktestResult, FeatureFrame, TradeEvent};

#[derive(Debug, Clone)]
pub struct BacktestConfig {
    pub initial_cash: f64,
    pub fee_rate: f64,
    pub slippage_bps: f64,
}

impl Default for BacktestConfig {
    fn default() -> Self {
        Self {
            initial_cash: 10_000.0,
            fee_rate: 0.0005,
            slippage_bps: 5.0,
        }
    }
}

pub fn run_backtest(
    actions: &[Action],
    features: &FeatureFrame,
    cfg: BacktestConfig,
) -> Result<BacktestResult> {
    let mut state = AccountState::flat(cfg.initial_cash);
    let mut trades = Vec::new();

    for (idx, feature) in features.rows.iter().enumerate() {
        let price = feature.bar.close;
        let action = actions.get(idx);
        if let Some(action) = action {
            action.validate()?;
            match action.side {
                ActionSide::Buy => {
                    let spend = state.cash * action.size_pct;
                    if spend > 0.0 && price > 0.0 {
                        let qty = spend / price;
                        let fee = spend * cfg.fee_rate;
                        state.cash -= spend + fee;
                        let total_position_value =
                            state.position_qty * state.position_avg_price + spend;
                        state.position_qty += qty;
                        state.position_avg_price =
                            total_position_value / state.position_qty.max(f64::EPSILON);
                        record_trade(
                            &mut trades,
                            feature.bar.close_time,
                            ActionSide::Buy,
                            price * (1.0 + cfg.slippage_bps / 10_000.0),
                            qty,
                            fee,
                            cfg.slippage_bps,
                            &mut state,
                        );
                    }
                }
                ActionSide::Sell => {
                    let qty_to_sell = state.position_qty * action.size_pct;
                    if qty_to_sell > 0.0 {
                        let proceeds = qty_to_sell * price;
                        let fee = proceeds * cfg.fee_rate;
                        state.cash += proceeds - fee;
                        state.position_qty -= qty_to_sell;
                        if state.position_qty <= f64::EPSILON {
                            state.position_avg_price = 0.0;
                            state.position_qty = 0.0;
                        }
                        record_trade(
                            &mut trades,
                            feature.bar.close_time,
                            ActionSide::Sell,
                            price * (1.0 - cfg.slippage_bps / 10_000.0),
                            qty_to_sell,
                            fee,
                            cfg.slippage_bps,
                            &mut state,
                        );
                    }
                }
                ActionSide::Hold => {}
            }
        }

        let position_value = state.position_qty * price;
        let equity = state.cash + position_value;
        if equity > 0.0 {
            let drawdown = (cfg.initial_cash - equity).max(0.0) / cfg.initial_cash;
            state.max_drawdown = state.max_drawdown.max(drawdown);
        }
        state.equity = equity;
    }

    let start = features
        .rows
        .first()
        .map(|b| b.bar.open_time)
        .unwrap_or_else(|| chrono::Utc::now());
    let end = features
        .rows
        .last()
        .map(|b| b.bar.close_time)
        .unwrap_or_else(|| chrono::Utc::now());

    Ok(BacktestResult {
        symbol: features.symbol.clone(),
        start,
        end,
        initial_cash: cfg.initial_cash,
        final_state: state,
        trades,
    })
}

fn record_trade(
    trades: &mut Vec<TradeEvent>,
    bar_time: chrono::DateTime<chrono::Utc>,
    action: ActionSide,
    fill_price: f64,
    qty: f64,
    fee_paid: f64,
    slippage_bps: f64,
    state: &mut AccountState,
) {
    trades.push(TradeEvent {
        bar_time,
        action,
        fill_price,
        qty,
        fee_paid,
        slippage_bps,
        resulting_state: state.clone(),
    });
}
