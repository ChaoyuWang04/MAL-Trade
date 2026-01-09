use anyhow::Result;
use mtrade_core::{Bar, FeatureBar, FeatureFrame, Symbol};

#[derive(Debug, Clone)]
pub struct IndicatorConfig {
    pub ema_fast: usize,
    pub ema_slow: usize,
    pub rsi_period: usize,
    pub cmf_period: usize,
}

impl Default for IndicatorConfig {
    fn default() -> Self {
        Self {
            ema_fast: 12,
            ema_slow: 26,
            rsi_period: 14,
            cmf_period: 20,
        }
    }
}

pub fn compute_features(
    symbol: Symbol,
    bars: &[Bar],
    cfg: IndicatorConfig,
) -> Result<FeatureFrame> {
    let ema_fast = ema(
        &bars.iter().map(|b| b.close).collect::<Vec<_>>(),
        cfg.ema_fast,
    );
    let ema_slow = ema(
        &bars.iter().map(|b| b.close).collect::<Vec<_>>(),
        cfg.ema_slow,
    );
    let rsi_vals = rsi(
        &bars.iter().map(|b| b.close).collect::<Vec<_>>(),
        cfg.rsi_period,
    );
    let cmf_vals = cmf(bars, cfg.cmf_period);

    let mut rows = Vec::with_capacity(bars.len());
    for (idx, bar) in bars.iter().enumerate() {
        rows.push(FeatureBar {
            bar: bar.clone(),
            ema_fast: ema_fast[idx],
            ema_slow: ema_slow[idx],
            rsi: rsi_vals[idx],
            cmf: cmf_vals[idx],
        });
    }

    Ok(FeatureFrame { symbol, rows })
}

fn ema(values: &[f64], period: usize) -> Vec<Option<f64>> {
    if period == 0 {
        return vec![None; values.len()];
    }
    let k = 2.0 / (period as f64 + 1.0);
    let mut result = Vec::with_capacity(values.len());
    let mut prev = None;
    for (idx, &v) in values.iter().enumerate() {
        let current = match prev {
            Some(p) => p + k * (v - p),
            None if idx + 1 == period => {
                let seed = values[0..=idx].iter().copied().sum::<f64>() / period as f64;
                seed
            }
            None => {
                result.push(None);
                continue;
            }
        };
        prev = Some(current);
        result.push(Some(current));
    }
    result
}

fn rsi(values: &[f64], period: usize) -> Vec<Option<f64>> {
    if period == 0 || values.len() < period + 1 {
        return vec![None; values.len()];
    }
    let mut rsis = vec![None; values.len()];
    let mut gains = 0.0;
    let mut losses = 0.0;

    for i in 1..=period {
        let delta = values[i] - values[i - 1];
        if delta >= 0.0 {
            gains += delta;
        } else {
            losses -= delta;
        }
    }
    let mut avg_gain = gains / period as f64;
    let mut avg_loss = losses / period as f64;

    let mut rsi_value = if avg_loss == 0.0 {
        100.0
    } else {
        let rs = avg_gain / avg_loss;
        100.0 - (100.0 / (1.0 + rs))
    };
    rsis[period] = Some(rsi_value);

    for i in period + 1..values.len() {
        let delta = values[i] - values[i - 1];
        let gain = delta.max(0.0);
        let loss = (-delta).max(0.0);
        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;
        rsi_value = if avg_loss == 0.0 {
            100.0
        } else {
            let rs = avg_gain / avg_loss;
            100.0 - (100.0 / (1.0 + rs))
        };
        rsis[i] = Some(rsi_value);
    }

    rsis
}

fn cmf(bars: &[Bar], period: usize) -> Vec<Option<f64>> {
    if period == 0 || bars.len() < period {
        return vec![None; bars.len()];
    }
    let mut result = vec![None; bars.len()];
    let mut acc = 0.0;
    let mut vol_acc = 0.0;

    for i in 0..bars.len() {
        let bar = &bars[i];
        let money_flow_mult = if (bar.high - bar.low).abs() < f64::EPSILON {
            0.0
        } else {
            ((bar.close - bar.low) - (bar.high - bar.close)) / (bar.high - bar.low)
        };
        let money_flow_vol = money_flow_mult * bar.volume;
        acc += money_flow_vol;
        vol_acc += bar.volume;

        if i >= period {
            let prev = &bars[i - period];
            let prev_mult = if (prev.high - prev.low).abs() < f64::EPSILON {
                0.0
            } else {
                ((prev.close - prev.low) - (prev.high - prev.close)) / (prev.high - prev.low)
            };
            let prev_flow_vol = prev_mult * prev.volume;
            acc -= prev_flow_vol;
            vol_acc -= prev.volume;
        }

        if i + 1 >= period && vol_acc != 0.0 {
            result[i] = Some(acc / vol_acc);
        }
    }

    result
}
