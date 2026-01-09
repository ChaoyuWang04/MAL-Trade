use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

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

    pub fn parquet_month_path(&self, date: NaiveDate) -> PathBuf {
        let month = format!("{:04}-{:02}", date.year(), date.month());
        self.root
            .join("data")
            .join("spot")
            .join(&self.symbol)
            .join("klines_1m")
            .join(format!("{month}.parquet"))
    }

    pub fn raw_csv_dir(&self) -> PathBuf {
        self.root
            .join("data")
            .join("spot")
            .join(&self.symbol)
            .join("klines_1m")
            .join("raw_csv")
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
