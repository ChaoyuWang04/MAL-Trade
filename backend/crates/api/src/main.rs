use std::net::SocketAddr;
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use tracing::info;
use tracing_subscriber::EnvFilter;

use backtester::{run_backtest, BacktestConfig};
use core::{Action, ActionSide, Bar, FeatureFrame};
use feature_engine::{compute_features, IndicatorConfig};

#[derive(Clone)]
struct AppState {
    symbol: String,
}

#[derive(Debug, Deserialize)]
struct BacktestRequest {
    #[serde(default = "default_symbol")]
    symbol: String,
    #[serde(default = "default_cash")]
    initial_cash: f64,
}

#[derive(Debug, Serialize)]
struct BacktestResponse {
    result: core::BacktestResult,
}

fn default_symbol() -> String {
    "BTCUSDT".to_string()
}

fn default_cash() -> f64 {
    10_000.0
}

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let app_state = AppState {
        symbol: default_symbol(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/backtests", post(run_backtest_handler))
        .with_state(app_state);

    let addr: SocketAddr = "0.0.0.0:3001".parse().expect("bind address");
    info!(%addr, "API starting");
    axum::serve(
        tokio::net::TcpListener::bind(addr).await?,
        app.into_make_service(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn run_backtest_handler(
    State(state): State<AppState>,
    Json(req): Json<BacktestRequest>,
) -> impl IntoResponse {
    match build_and_run(&state, req).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(err) => {
            tracing::error!(error = ?err, "backtest failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err.to_string() })),
            )
                .into_response()
        }
    }
}

async fn build_and_run(state: &AppState, req: BacktestRequest) -> Result<BacktestResponse> {
    let symbol = req.symbol.clone();
    let bars = demo_bars(&symbol);
    let frame = compute_features(symbol.clone(), &bars, IndicatorConfig::default())?;
    let actions = frame
        .rows
        .iter()
        .map(|_| Action::new(symbol.clone(), ActionSide::Hold, 0.0, Some("demo".into())))
        .collect::<Vec<_>>();
    let result = run_backtest(
        &actions,
        &FeatureFrame {
            symbol: symbol.clone(),
            rows: frame.rows.clone(),
        },
        BacktestConfig {
            initial_cash: req.initial_cash,
            ..Default::default()
        },
    )?;
    info!(symbol = %state.symbol, trades = result.trades.len(), "backtest complete");
    Ok(BacktestResponse { result })
}

fn demo_bars(symbol: &str) -> Vec<Bar> {
    let now = Utc::now();
    let mut bars = Vec::new();
    for i in 0..120 {
        let open_time = now - ChronoDuration::minutes(120 - i as i64);
        let close_time = open_time + ChronoDuration::minutes(1);
        let price = 50_000.0 + (i as f64 * 5.0);
        bars.push(Bar {
            open_time,
            close_time,
            open: price,
            high: price * 1.002,
            low: price * 0.998,
            close: price * 1.001,
            volume: 10.0 + i as f64,
            trades: 100 + i as u64,
        });
    }
    let _ = symbol; // reserved for future multi-symbol routing
    bars
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    // brief delay to allow logs to flush
    tokio::time::sleep(Duration::from_millis(50)).await;
}
