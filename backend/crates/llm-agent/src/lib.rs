use anyhow::{Context, Result};
use mtrade_core::{Action, ActionSide, Symbol};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct LlmDecision {
    pub action: String,
    pub size_pct: f64,
    pub note: Option<String>,
}

pub fn parse_decision(symbol: Symbol, payload: &str) -> Result<Action> {
    let decision: LlmDecision = serde_json::from_str(payload).context("invalid JSON from LLM")?;
    let side = match decision.action.to_uppercase().as_str() {
        "BUY" => ActionSide::Buy,
        "SELL" => ActionSide::Sell,
        _ => ActionSide::Hold,
    };
    let size_pct = decision.size_pct.clamp(0.0, 1.0);
    let action = Action::new(symbol, side, size_pct, decision.note);
    action.validate()?;
    Ok(action)
}
