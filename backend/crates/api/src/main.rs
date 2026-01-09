use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::TimeZone;
use serde::{Deserialize, Serialize};
use tracing::info;
use tracing_subscriber::EnvFilter;

use backtester::{run_backtest, BacktestConfig};
use core::DataSource;
use core::{Action, ActionSide, FeatureFrame};
use feature_engine::{compute_features, IndicatorConfig};
use storage::{DataPaths, ParquetDataSource};

#[derive(Clone)]
struct AppState {
    symbol: String,
    data_root: PathBuf,
}

#[derive(Debug, Deserialize)]
struct BacktestRequest {
    #[serde(default = "default_symbol")]
    symbol: String,
    #[serde(default = "default_cash")]
    initial_cash: f64,
    /// Start timestamp ms since epoch
    start_ms: Option<i64>,
    /// End timestamp ms since epoch
    end_ms: Option<i64>,
    /// Fallback window bars if start/end not provided
    #[serde(default = "default_window")]
    window: usize,
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

fn default_window() -> usize {
    500
}

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let app_state = AppState {
        symbol: default_symbol(),
        data_root: PathBuf::from("."),
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
    let data_paths = DataPaths::new(&state.data_root, &symbol);
    let source = ParquetDataSource::new(data_paths);

    let bars = if let (Some(start_ms), Some(end_ms)) = (req.start_ms, req.end_ms) {
        let start = chrono::Utc
            .timestamp_millis_opt(start_ms)
            .single()
            .ok_or_else(|| anyhow::anyhow!("invalid start_ms"))?;
        let end = chrono::Utc
            .timestamp_millis_opt(end_ms)
            .single()
            .ok_or_else(|| anyhow::anyhow!("invalid end_ms"))?;
        source.fetch_ohlcv(start, end)?
    } else {
        source.latest_window(req.window)?
    };

    let frame = compute_features(symbol.clone(), &bars, IndicatorConfig::default())?;
    let actions = frame
        .rows
        .iter()
        .map(|_| Action::new(symbol.clone(), ActionSide::Hold, 0.0, Some("hold".into())))
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
