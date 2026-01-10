use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::TimeZone;
use futures::executor;
use rustls::crypto::CryptoProvider;
use serde::{Deserialize, Serialize};
use tracing::info;
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

use backtester::{run_backtest, BacktestConfig};
use feature_engine::{compute_features, IndicatorConfig};
use live_trader::SessionManager;
use mtrade_core::DataSource;
use mtrade_core::{
    AccountState, Action, ActionSide, BacktestResult, FeatureBar, FeatureFrame, Order, OrderType,
};
use storage::{DataPaths, ParquetDataSource};

#[derive(Clone)]
struct AppState {
    symbol: String,
    data_root: PathBuf,
    sessions: SessionManager,
}

fn seed_latest(data_root: &Path, symbol: &str) -> Option<FeatureBar> {
    let paths = DataPaths::new(data_root, symbol);
    let source = ParquetDataSource::new(paths);
    match source.latest_window(1) {
        Ok(mut bars) => bars.pop().map(|bar| FeatureBar {
            bar,
            ema_fast: None,
            ema_slow: None,
            rsi: None,
            cmf: None,
        }),
        Err(_) => None,
    }
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
    result: BacktestResult,
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
    let provider = rustls::crypto::ring::default_provider();
    let _ = CryptoProvider::install_default(provider);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let app_state = AppState {
        symbol: default_symbol(),
        data_root: PathBuf::from("."),
        sessions: SessionManager::new(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/backtests", post(run_backtest_handler))
        .route("/session", post(create_session))
        .route("/state/:id", get(session_state))
        .route("/action/:id", post(apply_action))
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SessionMode {
    Backtest,
    Live,
}

#[derive(Debug, Deserialize)]
struct SessionRequest {
    mode: SessionMode,
    #[serde(default = "default_symbol")]
    symbol: String,
    #[serde(default = "default_cash")]
    initial_cash: f64,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
struct SessionResponse {
    session_id: String,
    mode: String,
}

async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<SessionRequest>,
) -> impl IntoResponse {
    let resp = match req.mode {
        SessionMode::Backtest => {
            let start_ms = req.start_ms.unwrap_or(0);
            let end_ms = req.end_ms.unwrap_or(0);
            if start_ms == 0 || end_ms == 0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": "start_ms/end_ms required for backtest"})),
                )
                    .into_response();
            }
            let paths = DataPaths::new(&state.data_root, &req.symbol);
            state
                .sessions
                .create_backtest(&req.symbol, paths, start_ms, end_ms, req.initial_cash)
                .await
        }
        SessionMode::Live => {
            state
                .sessions
                .create_live(
                    req.initial_cash,
                    &req.symbol,
                    seed_latest(&state.data_root, &req.symbol),
                )
                .await
        }
    };

    match resp {
        Ok(id) => (
            StatusCode::OK,
            Json(SessionResponse {
                session_id: id.to_string(),
                mode: format!("{:?}", req.mode),
            }),
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Debug, Serialize)]
struct StateResponse {
    session_id: String,
    mode: String,
    candle: Option<FeatureBar>,
    wallet: AccountState,
    open_orders: Vec<Order>,
}

async fn session_state(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    let parsed = Uuid::parse_str(&id);
    if parsed.is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid session id"})),
        )
            .into_response();
    }
    let id = parsed.unwrap();
    let resp = state
        .sessions
        .with_session(id, |session| {
            let candle = executor::block_on(session.source.next_candle());
            if let Some(ref c) = candle {
                session.check_fills(c);
            }
            Ok(StateResponse {
                session_id: id.to_string(),
                mode: format!("{:?}", session.source.mode()),
                candle,
                wallet: session.wallet.clone(),
                open_orders: session.wallet.open_orders.clone(),
            })
        })
        .await;

    match resp {
        Ok(body) => (StatusCode::OK, Json(body)).into_response(),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": err.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct ActionRequest {
    action: String,
    size_pct: f64,
    #[serde(default)]
    r#type: Option<String>,
    price: Option<f64>,
    order_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct ActionResponse {
    session_id: String,
    wallet: AccountState,
    open_orders: Vec<Order>,
}

async fn apply_action(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<ActionRequest>,
) -> impl IntoResponse {
    let parsed = Uuid::parse_str(&id);
    if parsed.is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid session id"})),
        )
            .into_response();
    }
    let id = parsed.unwrap();
    let resp = state
        .sessions
        .with_session(id, |session| {
            let side = match req.action.to_uppercase().as_str() {
                "BUY" => ActionSide::Buy,
                "SELL" => ActionSide::Sell,
                _ => ActionSide::Hold,
            };
            let latest = executor::block_on(session.source.next_candle());
            if let Some(ref candle) = latest {
                session.check_fills(candle);
            }
            let ot = match req
                .r#type
                .clone()
                .unwrap_or_else(|| "MARKET".to_string())
                .to_uppercase()
                .as_str()
            {
                "LIMIT" => OrderType::Limit,
                _ => OrderType::Market,
            };
            if ot == OrderType::Limit && req.price.is_none() && req.order_id.is_none() {
                return Err(anyhow::anyhow!("price required for limit order"));
            }
            session.apply_action(
                side,
                req.size_pct,
                ot,
                req.price,
                req.order_id.as_deref(),
                latest.as_ref().map(|c| c.bar.close),
            );
            Ok(ActionResponse {
                session_id: id.to_string(),
                wallet: session.wallet.clone(),
                open_orders: session.wallet.open_orders.clone(),
            })
        })
        .await;

    match resp {
        Ok(body) => (StatusCode::OK, Json(body)).into_response(),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": err.to_string()})),
        )
            .into_response(),
    }
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
