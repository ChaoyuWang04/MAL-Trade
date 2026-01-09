use backtester::{run_backtest, BacktestConfig};
use chrono::{Duration, Utc};
use core::{Action, ActionSide, Bar, FeatureBar, FeatureFrame, Symbol};

fn bars_and_features() -> FeatureFrame {
    let base = Utc::now();
    let prices = vec![100.0, 110.0];
    let rows = prices
        .iter()
        .enumerate()
        .map(|(i, price)| FeatureBar {
            bar: Bar {
                open_time: base + Duration::minutes(i as i64),
                close_time: base + Duration::minutes(i as i64 + 1),
                open: *price,
                high: *price,
                low: *price,
                close: *price,
                volume: 1.0,
                trades: 1,
            },
            ema_fast: None,
            ema_slow: None,
            rsi: None,
            cmf: None,
        })
        .collect();
    FeatureFrame {
        symbol: Symbol::from("BTCUSDT"),
        rows,
    }
}

#[test]
fn pnl_respects_fees_and_slippage() {
    let frame = bars_and_features();
    let actions = vec![
        Action::new(frame.symbol.clone(), ActionSide::Buy, 0.5, None),
        Action::new(frame.symbol.clone(), ActionSide::Sell, 1.0, None),
    ];
    let cfg = BacktestConfig {
        initial_cash: 10_000.0,
        fee_rate: 0.001,
        slippage_bps: 10.0,
    };
    let result = run_backtest(&actions, &frame, cfg).unwrap();
    let final_cash = result.final_state.cash;
    // Rough expected: buy $5000 + fee $5 at price 100 -> qty ~49.95, sell at price 110 with slippage -> ~109.89, minus fee
    assert!(final_cash > 10_400.0 && final_cash < 10_600.0);
    assert_eq!(result.trades.len(), 2);
}
