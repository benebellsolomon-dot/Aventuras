//! Atomic turn persistence (CR-1).
//!
//! `tauri-plugin-sql` v2 runs on a sqlx `SqlitePool` and exposes no JS
//! transaction API, so `BEGIN`/`COMMIT` issued as separate `execute()` calls can
//! land on different pooled connections — the app documents this in
//! `database.ts` (`bulkInsertEntries`) and works around it there. A story turn
//! needs ~12 heterogeneous writes + a rollback-delta write to commit
//! all-or-nothing; the JS side buffers those writes and hands the whole batch to
//! this command, which runs them inside a real `pool.begin()`/`tx.commit()` on a
//! DEDICATED single-connection pool (same pattern as `migration_patch.rs`). Any
//! statement failing rolls the whole batch back.

use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

use serde::Deserialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use tokio::sync::OnceCell;

/// Managed Tauri state: a dedicated pool used only for atomic turn flushes.
///
/// Lazily opened on first use — the sqlite file is created and migrated by
/// `tauri-plugin-sql` when the frontend first loads the DB, which can be after
/// this Rust setup runs (first launch). By the time a turn is played the DB
/// exists, so `get()` opens the pool then and caches it.
///
/// `db_path` is resolved in `lib.rs` from `app_config_dir` — the same directory
/// the plugin maps `sqlite:aventura.db` against — so this pool always opens the
/// file the app is actually using (they diverge on Linux).
pub struct TurnTxPool {
    db_path: PathBuf,
    pool: OnceCell<Pool<Sqlite>>,
}

impl TurnTxPool {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            pool: OnceCell::new(),
        }
    }

    async fn get(&self) -> Result<&Pool<Sqlite>, sqlx::Error> {
        self.pool
            .get_or_try_init(|| init_pool(&self.db_path))
            .await
    }
}

/// One buffered write: a parameterized statement. `params` carry the same
/// JSON-primitive values the JS `db.execute` calls already pass (strings —
/// including JSON.stringified blobs — numbers, booleans, null).
#[derive(Deserialize)]
pub struct BatchStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<serde_json::Value>,
}

/// Open the dedicated turn-transaction pool.
///
/// `max_connections = 1` so `BEGIN`…`COMMIT` always run on the same connection
/// (the whole point). `foreign_keys(true)` mirrors the plugin's per-connection
/// `PRAGMA foreign_keys = ON` so FK enforcement matches the rest of the app.
/// `busy_timeout` lets the flush wait out a transient writer lock (WAL) from the
/// plugin pool instead of failing the turn with `SQLITE_BUSY`.
pub async fn init_pool(db_path: &Path) -> Result<Pool<Sqlite>, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.display()))?
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .create_if_missing(false);

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
}

fn bind_value<'q>(
    query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: &serde_json::Value,
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        serde_json::Value::Null => query.bind(None::<String>),
        serde_json::Value::Bool(b) => query.bind(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => query.bind(s.clone()),
        // Arrays/objects should already arrive JSON.stringified as strings; bind
        // their JSON text defensively rather than dropping the value.
        other => query.bind(other.to_string()),
    }
}

/// Run every buffered statement inside a single transaction. Commits on success;
/// on any error the transaction is dropped (SQLite rolls it back) and the error
/// is returned so the JS side can revert its in-memory snapshot.
#[tauri::command]
pub async fn exec_batch_tx(
    pool: tauri::State<'_, TurnTxPool>,
    statements: Vec<BatchStatement>,
) -> Result<(), String> {
    let pool = pool.get().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for stmt in &statements {
        let mut query = sqlx::query(&stmt.sql);
        for param in &stmt.params {
            query = bind_value(query, param);
        }
        query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("exec_batch_tx statement failed: {e}"))?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
