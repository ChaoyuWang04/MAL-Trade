use std::fs::File;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::Duration as StdDuration;

use ::zip::ZipArchive;
use anyhow::{Context, Result};
use chrono::{Duration, NaiveDate, Utc};
use clap::{Parser, Subcommand};
use polars::prelude::{
    col, CsvReadOptions, DataFrame, DataType, IntoLazy, ParquetWriter, SerReader,
};
use tokio::fs;
use tokio::time::sleep;
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
        /// Year, e.g., 2024
        #[arg(long)]
        year: u32,
        /// Month, 1-12
        #[arg(long)]
        month: u32,
        /// Optional day for daily file (1-31). If omitted, monthly file is used.
        #[arg(long)]
        day: Option<u32>,
        /// Retries on network failure
        #[arg(long, default_value_t = 3)]
        retries: u8,
    },
    /// Convert downloaded CSV ZIP to Parquet and detect gaps
    Convert {
        #[arg(long)]
        year: u32,
        #[arg(long)]
        month: u32,
        #[arg(long)]
        day: Option<u32>,
    },
    /// Download + Convert in one shot
    Ingest {
        #[arg(long)]
        year: u32,
        #[arg(long)]
        month: u32,
        #[arg(long)]
        day: Option<u32>,
        #[arg(long, default_value_t = 3)]
        retries: u8,
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
        Commands::Backfill {
            year,
            month,
            day,
            retries,
        } => {
            backfill(&paths, year, month, day, retries).await?;
        }
        Commands::Convert { year, month, day } => {
            convert(&paths, year, month, day).await?;
        }
        Commands::Ingest {
            year,
            month,
            day,
            retries,
        } => {
            backfill(&paths, year, month, day, retries).await?;
            convert(&paths, year, month, day).await?;
        }
        Commands::Inspect => {
            inspect(&paths).await?;
        }
    }

    Ok(())
}

async fn backfill(
    paths: &DataPaths,
    year: u32,
    month: u32,
    day: Option<u32>,
    retries: u8,
) -> Result<()> {
    let url = vision_url(&paths.symbol, year, month, day);
    let dest = paths.raw_zip_path(year, month, day);
    info!(%url, path=?dest, "download start");
    download_with_retry(&url, &dest, retries).await?;

    let mut offsets = Offsets::load(&paths.metadata_path())?;
    let (start, end, month_key) = coverage_span(year, month, day)?;
    offsets.months.push(storage::MonthCoverage {
        month: month_key,
        start,
        end,
        file: dest
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
    });
    offsets.last_updated = Some(Utc::now());
    offsets.save(&paths.metadata_path())?;
    Ok(())
}

async fn convert(paths: &DataPaths, year: u32, month: u32, day: Option<u32>) -> Result<()> {
    let zip_path = paths.raw_zip_path(year, month, day);
    let parquet_path = paths.parquet_path(year, month, day);
    info!(?zip_path, ?parquet_path, "convert start");
    let bytes = tokio::fs::read(&zip_path)
        .await
        .with_context(|| "read zip")?;
    let mut archive = ZipArchive::new(Cursor::new(bytes)).context("open zip")?;
    if archive.len() == 0 {
        anyhow::bail!("zip archive empty");
    }
    let mut file = archive.by_index(0).context("open zipped csv")?;
    let mut csv_bytes = Vec::new();
    file.read_to_end(&mut csv_bytes)?;

    let reader = CsvReadOptions::default()
        .with_has_header(false)
        .into_reader_with_file_handle(Cursor::new(csv_bytes));

    let mut df = reader.finish().context("parse csv")?;
    let desired = [
        "open_time",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "close_time",
        "quote_asset_volume",
        "trades",
        "taker_buy_base",
        "taker_buy_quote",
        "ignore",
    ];
    for (idx, name) in desired.iter().enumerate() {
        let current = format!("column_{}", idx + 1);
        df.rename(&current, name)
            .with_context(|| format!("rename {current} -> {name}"))?;
    }

    let df = df
        .lazy()
        .select([
            col("open_time").cast(DataType::Int64),
            col("close_time").cast(DataType::Int64),
            col("open").cast(DataType::Float64),
            col("high").cast(DataType::Float64),
            col("low").cast(DataType::Float64),
            col("close").cast(DataType::Float64),
            col("volume").cast(DataType::Float64),
            col("trades").cast(DataType::UInt64),
            col("quote_asset_volume").cast(DataType::Float64),
            col("taker_buy_base").cast(DataType::Float64),
            col("taker_buy_quote").cast(DataType::Float64),
        ])
        .collect()
        .context("cast columns")?;

    let gaps = detect_gaps(&df)?;
    if !gaps.is_empty() {
        warn!(missing = gaps.len(), "data gaps detected");
        for (start, end) in gaps.iter().take(5) {
            warn!(%start, %end, "gap");
        }
    }

    if let Some(parent) = parquet_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    ParquetWriter::new(File::create(&parquet_path)?)
        .finish(&mut df.clone())
        .context("write parquet")?;

    info!(rows = df.height(), path=?parquet_path, "parquet written");
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

async fn download_with_retry(url: &str, dest: &Path, retries: u8) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).await?;
    }
    let mut attempt = 0;
    loop {
        attempt += 1;
        match reqwest::get(url).await {
            Ok(resp) if resp.status().is_success() => {
                let bytes = resp.bytes().await?;
                fs::write(dest, &bytes).await?;
                return Ok(());
            }
            Ok(resp) => {
                warn!(status=?resp.status(), attempt, "download failed");
            }
            Err(err) => {
                warn!(?err, attempt, "request failed");
            }
        }
        if attempt >= retries {
            anyhow::bail!("exceeded retries for {url}");
        }
        sleep(StdDuration::from_millis(500)).await;
    }
}

fn vision_url(symbol: &str, year: u32, month: u32, day: Option<u32>) -> String {
    match day {
        Some(day) => format!("https://data.binance.vision/data/spot/daily/klines/{symbol}/1m/{symbol}-1m-{year:04}-{month:02}-{day:02}.zip"),
        None => format!("https://data.binance.vision/data/spot/monthly/klines/{symbol}/1m/{symbol}-1m-{year:04}-{month:02}.zip"),
    }
}

fn coverage_span(
    year: u32,
    month: u32,
    day: Option<u32>,
) -> Result<(chrono::DateTime<Utc>, chrono::DateTime<Utc>, String)> {
    let start = match day {
        Some(day) => NaiveDate::from_ymd_opt(year as i32, month, day)
            .context("invalid date")?
            .and_hms_opt(0, 0, 0)
            .context("invalid hms")?,
        None => NaiveDate::from_ymd_opt(year as i32, month, 1)
            .context("invalid date")?
            .and_hms_opt(0, 0, 0)
            .context("invalid hms")?,
    };
    let end = if day.is_some() {
        start + Duration::days(1)
    } else {
        start + Duration::days(32)
    };
    let month_key = if let Some(day) = day {
        format!("{year:04}-{month:02}-{day:02}")
    } else {
        format!("{year:04}-{month:02}")
    };
    Ok((
        chrono::DateTime::<Utc>::from_naive_utc_and_offset(start, Utc),
        chrono::DateTime::<Utc>::from_naive_utc_and_offset(end, Utc),
        month_key,
    ))
}

fn detect_gaps(df: &DataFrame) -> Result<Vec<(i64, i64)>> {
    let open_time = df.column("open_time")?.i64()?;
    let mut gaps = Vec::new();
    let expected = 60_000i64;
    for i in 1..open_time.len() {
        let prev = open_time.get(i - 1).unwrap_or(0);
        let cur = open_time.get(i).unwrap_or(0);
        if cur - prev > expected {
            gaps.push((prev, cur));
        }
    }
    Ok(gaps)
}
