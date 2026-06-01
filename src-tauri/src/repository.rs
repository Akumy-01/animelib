use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::models::{
    AnimeEntry, AppPreferences, AppStatePayload, MediaType, WatchStatus,
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportPayload {
    app: String,
    format_version: u8,
    entries: Vec<AnimeEntry>,
    preferences: AppPreferences,
}

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("file system error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("repository lock poisoned")]
    LockPoisoned,
}

pub type RepositoryResult<T> = Result<T, RepositoryError>;

pub struct LibraryRepository {
    path: PathBuf,
    connection: Mutex<Connection>,
}

impl LibraryRepository {
    pub fn open(path: impl AsRef<Path>) -> RepositoryResult<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(&path)?;
        let repository = Self {
            path,
            connection: Mutex::new(connection),
        };
        repository.initialize()?;
        Ok(repository)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn app_state(&self) -> RepositoryResult<AppStatePayload> {
        Ok(AppStatePayload {
            entries: self.list_entries()?,
            preferences: self.load_preferences()?,
            has_api_key: self.api_key()?.is_some(),
        })
    }

    pub fn list_entries(&self) -> RepositoryResult<Vec<AnimeEntry>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, tmdb_id, media_type, season_number, parent_series_id, name, overview,
                    poster_url, backdrop_url, details_url, original_language_code, on_air_date,
                    watch_status, date_saved, date_started, date_finished,
                    is_date_tracking_enabled, score, favorite, notes, using_custom_poster
             FROM anime_entries
             ORDER BY date_saved DESC",
        )?;

        let entries = statement
            .query_map([], row_to_entry)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn insert_entry(&self, entry: &AnimeEntry) -> RepositoryResult<()> {
        let connection = self.connection()?;
        insert_entry_with_connection(&connection, entry)
    }

    pub fn update_entry(&self, entry: &AnimeEntry) -> RepositoryResult<()> {
        self.insert_entry(entry)
    }

    pub fn delete_entry(&self, id: &str) -> RepositoryResult<()> {
        let connection = self.connection()?;
        connection.execute("DELETE FROM anime_entries WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn save_api_key(&self, api_key: &str) -> RepositoryResult<()> {
        self.set_setting("tmdb_api_key", api_key)
    }

    pub fn api_key(&self) -> RepositoryResult<Option<String>> {
        self.get_setting("tmdb_api_key")
    }

    pub fn load_preferences(&self) -> RepositoryResult<AppPreferences> {
        match self.get_setting("preferences")? {
            Some(value) => Ok(serde_json::from_str(&value)?),
            None => Ok(AppPreferences::default()),
        }
    }

    pub fn save_preferences(&self, preferences: &AppPreferences) -> RepositoryResult<()> {
        self.set_setting("preferences", &serde_json::to_string(preferences)?)
    }

    pub fn export_json(&self) -> RepositoryResult<String> {
        let payload = ExportPayload {
            app: "AniShelf Windows".into(),
            format_version: 1,
            entries: self.list_entries()?,
            preferences: self.load_preferences()?,
        };
        Ok(serde_json::to_string_pretty(&payload)?)
    }

    pub fn restore_json(&self, payload_json: &str) -> RepositoryResult<()> {
        let payload: ExportPayload = serde_json::from_str(payload_json)?;
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM anime_entries", [])?;
        transaction.execute("DELETE FROM settings WHERE key = 'preferences'", [])?;

        for entry in payload.entries {
            insert_entry_with_connection(&transaction, &entry)?;
        }

        transaction.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params!["preferences", serde_json::to_string(&payload.preferences)?],
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn initialize(&self) -> RepositoryResult<()> {
        let connection = self.connection()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS anime_entries (
                id TEXT PRIMARY KEY NOT NULL,
                tmdb_id INTEGER NOT NULL,
                media_type TEXT NOT NULL,
                season_number INTEGER,
                parent_series_id INTEGER,
                name TEXT NOT NULL,
                overview TEXT,
                poster_url TEXT,
                backdrop_url TEXT,
                details_url TEXT,
                original_language_code TEXT,
                on_air_date TEXT,
                watch_status TEXT NOT NULL,
                date_saved TEXT NOT NULL,
                date_started TEXT,
                date_finished TEXT,
                is_date_tracking_enabled INTEGER NOT NULL,
                score INTEGER,
                favorite INTEGER NOT NULL,
                notes TEXT NOT NULL,
                using_custom_poster INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn get_setting(&self, key: &str) -> RepositoryResult<Option<String>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value)
    }

    fn set_setting(&self, key: &str, value: &str) -> RepositoryResult<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    fn connection(&self) -> RepositoryResult<std::sync::MutexGuard<'_, Connection>> {
        self.connection.lock().map_err(|_| RepositoryError::LockPoisoned)
    }
}

fn insert_entry_with_connection(connection: &Connection, entry: &AnimeEntry) -> RepositoryResult<()> {
    let is_date_tracking_enabled = entry.is_date_tracking_enabled as i64;
    let favorite = entry.favorite as i64;
    let using_custom_poster = entry.using_custom_poster as i64;
    connection.execute(
        "INSERT OR REPLACE INTO anime_entries (
            id, tmdb_id, media_type, season_number, parent_series_id, name, overview,
            poster_url, backdrop_url, details_url, original_language_code, on_air_date,
            watch_status, date_saved, date_started, date_finished,
            is_date_tracking_enabled, score, favorite, notes, using_custom_poster
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            entry.id,
            entry.tmdb_id,
            entry.media_type.as_str(),
            entry.season_number,
            entry.parent_series_id,
            entry.name,
            entry.overview,
            entry.poster_url,
            entry.backdrop_url,
            entry.details_url,
            entry.original_language_code,
            entry.on_air_date,
            entry.watch_status.as_str(),
            entry.date_saved,
            entry.date_started,
            entry.date_finished,
            is_date_tracking_enabled,
            entry.score,
            favorite,
            entry.notes,
            using_custom_poster,
        ],
    )?;
    Ok(())
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnimeEntry> {
    let media_type = MediaType::from_str(row.get::<_, String>(2)?.as_str());
    let watch_status = WatchStatus::from_str(row.get::<_, String>(12)?.as_str());
    Ok(AnimeEntry {
        id: row.get(0)?,
        tmdb_id: row.get(1)?,
        media_type,
        season_number: row.get(3)?,
        parent_series_id: row.get(4)?,
        name: row.get(5)?,
        overview: row.get(6)?,
        poster_url: row.get(7)?,
        backdrop_url: row.get(8)?,
        details_url: row.get(9)?,
        original_language_code: row.get(10)?,
        on_air_date: row.get(11)?,
        watch_status,
        date_saved: row.get(13)?,
        date_started: row.get(14)?,
        date_finished: row.get(15)?,
        is_date_tracking_enabled: row.get::<_, i64>(16)? != 0,
        score: row.get(17)?,
        favorite: row.get::<_, i64>(18)? != 0,
        notes: row.get(19)?,
        using_custom_poster: row.get::<_, i64>(20)? != 0,
    })
}
