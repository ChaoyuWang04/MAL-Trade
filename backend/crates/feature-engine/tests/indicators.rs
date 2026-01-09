use chrono::{Duration, Utc};
use core::{Bar, Symbol};
use feature_engine::{compute_features, IndicatorConfig};

fn fixture_bars() -> Vec<Bar> {
    let base = Utc::now();
    let closes = vec![1.0, 2.0, 3.0, 2.0];
    closes
        .iter()
        .enumerate()
        .map(|(i, close)| Bar {
            open_time: base + Duration::minutes(i as i64),
            close_time: base + Duration::minutes(i as i64 + 1),
            open: *close,
            high: *close + 0.5,
            low: *close - 0.5,
            close: *close,
            volume: 10.0,
            trades: 1,
        })
        .collect()
}

#[test]
fn ema_and_rsi_expected_values() {
    let bars = fixture_bars();
    let cfg = IndicatorConfig {
        ema_fast: 3,
        ema_slow: 3,
        rsi_period: 3,
        cmf_period: 2,
    };
    let frame = compute_features(Symbol::from("BTCUSDT"), &bars, cfg).unwrap();
    let ema_fast = frame.rows[2].ema_fast.unwrap();
    let ema_next = frame.rows[3].ema_fast.unwrap();
    assert!((ema_fast - 2.0).abs() < 1e-6);
    assert!((ema_next - 2.0).abs() < 1e-6);

    let rsi = frame.rows[3].rsi.unwrap();
    assert!((rsi - 66.6666).abs() < 0.1);
}
