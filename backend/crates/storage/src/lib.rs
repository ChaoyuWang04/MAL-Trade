use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use polars::prelude::*;
use serde::{Deserialize, Serialize};

use core::{Bar, DataSource, DataSourceError};

#[derive(Debug, Clone)]
pub struct DataPaths {
    pub root: PathBuf,
    pub symbol: String,
}

impl DataPaths {
    pub fn new(root: impl AsRef<Path>, symbol: impl Into<String>) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
            symbol: symbol.into(),
        }
    }

    pub fn parquet_path(&self, year: u32, month: u32, day: Option<u32>) -> PathBuf {
        match day {
            Some(day) => self
                .parquet_dir()
                .join("daily")
                .join(format!("{year:04}-{month:02}-{day:02}.parquet")),
            None => self
                .parquet_dir()
                .join(format!("{year:04}-{month:02}.parquet")),
        }
    }

    pub fn raw_zip_path(&self, year: u32, month: u32, day: Option<u32>) -> PathBuf {
        let name = match day {
            Some(day) => format!("{}-1m-{year:04}-{month:02}-{day:02}.zip", self.symbol),
            None => format!("{}-1m-{year:04}-{month:02}.zip", self.symbol),
        };
        self.raw_csv_dir().join(name)
    }

    pub fn raw_csv_dir(&self) -> PathBuf {
        self.parquet_dir().join("raw_csv")
    }

    pub fn parquet_dir(&self) -> PathBuf {
        self.root
            .join("data")
            .join("spot")
            .join(&self.symbol)
            .join("klines_1m")
    }

    pub fn metadata_path(&self) -> PathBuf {
        self.root
            .join("data")
            .join("spot")
            .join(&self.symbol)
            .join("metadata")
            .join("offsets.json")
    }

    pub fn ensure_base_dirs(&self) -> Result<()> {
        for path in [
            self.raw_csv_dir(),
            self.parquet_dir(),
            self.parquet_dir().join("daily"),
            self.metadata_path()
                .parent()
                .map(PathBuf::from)
                .unwrap_or_else(|| self.root.clone()),
        ] {
            if !path.exists() {
                fs::create_dir_all(&path).with_context(|| path.display().to_string())?;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Offsets {
    pub symbol: String,
    pub months: Vec<MonthCoverage>,
    pub last_updated: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthCoverage {
    pub month: String,
    pub start: chrono::DateTime<Utc>,
    pub end: chrono::DateTime<Utc>,
    pub file: String,
}

impl Offsets {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        fs::write(path, content)?;
        Ok(())
    }
}

pub struct ParquetDataSource {
    pub paths: DataPaths,
}

impl ParquetDataSource {
    pub fn new(paths: DataPaths) -> Self {
        Self { paths }
    }

    fn parquet_glob(&self) -> String {
        self.paths
            .parquet_dir()
            .join("*.parquet")
            .to_string_lossy()
            .to_string()
    }
}

impl DataSource for ParquetDataSource {
    fn fetch_ohlcv(
        &self,
        start: chrono::DateTime<Utc>,
        end: chrono::DateTime<Utc>,
    ) -> Result<Vec<Bar>, DataSourceError> {
        if start >= end {
            return Err(DataSourceError::InvalidRange);
        }
        let start_ms = start.timestamp_millis();
        let end_ms = end.timestamp_millis();
        let glob = self.parquet_glob();
        let lf = LazyFrame::scan_parquet(&glob, ScanArgsParquet::default())
            .map_err(|e| DataSourceError::Other(e.to_string()))?
            .filter(
                col("open_time")
                    .gt_eq(lit(start_ms))
                    .and(col("open_time").lt(lit(end_ms))),
            )
            .sort(
                ["open_time"],
                SortMultipleOptions::new().with_maintain_order(true),
            );
        let df = lf
            .collect()
            .map_err(|e| DataSourceError::Other(e.to_string()))?;
        let bars = dataframe_to_bars(&df)?;
        if bars.is_empty() {
            return Err(DataSourceError::DataGap { start, end });
        }
        Ok(bars)
    }

    fn latest_window(&self, n: usize) -> Result<Vec<Bar>, DataSourceError> {
        let glob = self.parquet_glob();
        let lf = LazyFrame::scan_parquet(&glob, ScanArgsParquet::default())
            .map_err(|e| DataSourceError::Other(e.to_string()))?
            .sort(
                ["open_time"],
                SortMultipleOptions::new().with_maintain_order(true),
            );
        let df = lf
            .tail(n as IdxSize)
            .collect()
            .map_err(|e| DataSourceError::Other(e.to_string()))?;
        dataframe_to_bars(&df)
    }
}

fn dataframe_to_bars(df: &DataFrame) -> Result<Vec<Bar>, DataSourceError> {
    let columns = [
        "open_time",
        "close_time",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "trades",
    ];
    for col_name in &columns {
        if !df.get_column_names().iter().any(|c| c == col_name) {
            return Err(DataSourceError::Other(format!("missing column {col_name}")));
        }
    }
    let open_time = df
        .column("open_time")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .i64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let close_time = df
        .column("close_time")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .i64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let open = df
        .column("open")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .f64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let high = df
        .column("high")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .f64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let low = df
        .column("low")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .f64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let close = df
        .column("close")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .f64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let volume = df
        .column("volume")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .f64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;
    let trades = df
        .column("trades")
        .map_err(|e| DataSourceError::Other(e.to_string()))?
        .u64()
        .map_err(|e| DataSourceError::Other(e.to_string()))?;

    let mut result = Vec::with_capacity(df.height());
    for i in 0..df.height() {
        let bar = Bar {
            open_time: Utc
                .timestamp_millis_opt(open_time.get(i).unwrap_or(0))
                .single()
                .ok_or_else(|| DataSourceError::Other("invalid open_time".into()))?,
            close_time: Utc
                .timestamp_millis_opt(close_time.get(i).unwrap_or(0))
                .single()
                .ok_or_else(|| DataSourceError::Other("invalid close_time".into()))?,
            open: open.get(i).unwrap_or(0.0),
            high: high.get(i).unwrap_or(0.0),
            low: low.get(i).unwrap_or(0.0),
            close: close.get(i).unwrap_or(0.0),
            volume: volume.get(i).unwrap_or(0.0),
            trades: trades.get(i).unwrap_or(0),
        };
        result.push(bar);
    }
    Ok(result)
}
