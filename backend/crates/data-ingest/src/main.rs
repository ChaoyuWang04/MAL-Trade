use std::path::{Path, PathBuf};

use anyhow::Result;
use chrono::{Datelike, Duration, Utc};
use clap::{Parser, Subcommand};
use tokio::fs;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use core::Symbol;
use storage::{DataPaths, Offsets};

#[derive(Parser, Debug)]
#[command(name = "data-ingest", version)]
struct Cli {
    /// Root of the repository (used to resolve data paths)
    #[arg(long, default_value = ".")]
    base_dir: PathBuf,

    /// Trading pair symbol (e.g., BTCUSDT)
    #[arg(long, default_value = "BTCUSDT")]
    symbol: Symbol,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Download monthly klines from Binance Vision
    Backfill {
        /// How many latest months to download (e.g., 2)
        #[arg(long, default_value_t = 2)]
        months: u32,
        /// Skip network writes; only print the plan
        #[arg(long, default_value_t = true)]
        dry_run: bool,
    },
    /// Inspect what months are already present
    Inspect,
}

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let cli = Cli::parse();
    let paths = DataPaths::new(&cli.base_dir, &cli.symbol);
    paths.ensure_base_dirs()?;

    match cli.command {
        Commands::Backfill { months, dry_run } => {
            backfill(&paths, months, dry_run).await?;
        }
        Commands::Inspect => {
            inspect(&paths).await?;
        }
    }

    Ok(())
}

async fn backfill(paths: &DataPaths, months: u32, dry_run: bool) -> Result<()> {
    let target_months = latest_months(months);
    let mut offsets = Offsets::load(&paths.metadata_path())?;

    for (year, month) in target_months {
        let url = vision_month_url(&paths.symbol, year, month);
        let filename = format!("{}-1m-{year}-{month:02}.csv.zip", paths.symbol);
        let dest = paths.raw_csv_dir().join(&filename);
        info!(%url, path=?dest, dry_run, "plan download");
        if dry_run {
            continue;
        }
        download_to(&url, &dest).await?;

        let start = chrono::NaiveDate::from_ymd_opt(year as i32, month, 1)
            .expect("valid month")
            .and_hms_opt(0, 0, 0)
            .expect("valid time");
        let end = start + Duration::days(32);
        offsets.months.push(storage::MonthCoverage {
            month: format!("{year}-{month:02}"),
            start: chrono::DateTime::<Utc>::from_naive_utc_and_offset(start, Utc),
            end: chrono::DateTime::<Utc>::from_naive_utc_and_offset(end, Utc),
            file: filename,
        });
    }

    offsets.last_updated = Some(Utc::now());
    if !dry_run {
        offsets.save(&paths.metadata_path())?;
    }

    Ok(())
}

async fn inspect(paths: &DataPaths) -> Result<()> {
    let offsets = Offsets::load(&paths.metadata_path())?;
    if offsets.months.is_empty() {
        warn!("no months recorded yet");
    } else {
        for month in offsets.months {
            info!(month = %month.month, file = %month.file, %month.start, %month.end, "covered month");
        }
    }
    Ok(())
}

fn latest_months(count: u32) -> Vec<(u32, u32)> {
    let mut months = Vec::new();
    let mut cursor = Utc::now().date_naive();
    for _ in 0..count {
        months.push((cursor.year() as u32, cursor.month()));
        cursor = cursor
            .with_day(1)
            .expect("first day")
            .pred_opt()
            .unwrap_or(cursor);
    }
    months
}

async fn download_to(url: &str, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).await?;
    }
    let response = reqwest::get(url).await?;
    let status = response.status();
    if !status.is_success() {
        warn!(%status, %url, "download failed");
        anyhow::bail!("download failed");
    }
    let bytes = response.bytes().await?;
    fs::write(dest, bytes).await?;
    Ok(())
}

fn vision_month_url(symbol: &str, year: u32, month: u32) -> String {
    format!(
        "https://data.binance.vision/data/spot/monthly/klines/{symbol}/1m/{symbol}-1m-{year}-{month:02}.csv.zip"
    )
}
