use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::models::{
    entry_id, AnimeDetail, AnimeEntry, AppPreferences, AppStatePayload, EpisodeProgress, MediaType,
    WatchStatus,
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportPayload {
    app: String,
    format_version: u8,
    entries: Vec<AnimeEntry>,
    preferences: AppPreferences,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IosLibraryExportPayload {
    app: Option<String>,
    entries: Vec<IosLibraryExportRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IosLibraryExportRecord {
    title: String,
    anime_type: String,
    season_number: Option<i64>,
    #[serde(rename = "detailsURL", alias = "detailsUrl")]
    details_url: Option<String>,
    release_date: Option<String>,
    #[serde(default)]
    date_saved: String,
    watch_status: Option<String>,
    date_started: Option<String>,
    date_finished: Option<String>,
    score: Option<i64>,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    using_custom_poster: bool,
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

    pub fn save_detail(&self, detail: &AnimeDetail) -> RepositoryResult<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT OR REPLACE INTO anime_details (
                entry_id, language, title, subtitle, overview, status, air_date, vote_average,
                runtime_minutes, episode_count, season_count, characters_json, staff_json,
                seasons_json, episodes_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                detail.entry_id,
                detail.language,
                detail.title,
                detail.subtitle,
                detail.overview,
                detail.status,
                detail.air_date,
                detail.vote_average,
                detail.runtime_minutes,
                detail.episode_count,
                detail.season_count,
                serde_json::to_string(&detail.characters)?,
                serde_json::to_string(&detail.staff)?,
                serde_json::to_string(&detail.seasons)?,
                serde_json::to_string(&detail.episodes)?,
            ],
        )?;
        Ok(())
    }

    pub fn detail_for_entry(&self, entry_id: &str) -> RepositoryResult<Option<AnimeDetail>> {
        let connection = self.connection()?;
        let detail = connection
            .query_row(
                "SELECT entry_id, language, title, subtitle, overview, status, air_date,
                        vote_average, runtime_minutes, episode_count, season_count,
                        characters_json, staff_json, seasons_json, episodes_json
                 FROM anime_details
                 WHERE entry_id = ?1",
                params![entry_id],
                |row| {
                    let characters_json: String = row.get(11)?;
                    let staff_json: String = row.get(12)?;
                    let seasons_json: String = row.get(13)?;
                    let episodes_json: String = row.get(14)?;
                    Ok((
                        row_to_detail(row)?,
                        characters_json,
                        staff_json,
                        seasons_json,
                        episodes_json,
                    ))
                },
            )
            .optional()?;

        match detail {
            Some((mut detail, characters_json, staff_json, seasons_json, episodes_json)) => {
                detail.characters = serde_json::from_str(&characters_json)?;
                detail.staff = serde_json::from_str(&staff_json)?;
                detail.seasons = serde_json::from_str(&seasons_json)?;
                detail.episodes = serde_json::from_str(&episodes_json)?;
                Ok(Some(detail))
            }
            None => Ok(None),
        }
    }

    pub fn set_episode_watched(
        &self,
        entry_id: &str,
        episode_number: i64,
        watched: bool,
    ) -> RepositoryResult<()> {
        let connection = self.connection()?;
        let watched_at = if watched {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            None
        };
        connection.execute(
            "INSERT OR REPLACE INTO episode_progresses
                (entry_id, episode_number, watched, watched_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![entry_id, episode_number, watched as i64, watched_at],
        )?;
        Ok(())
    }

    pub fn episode_progress_for_entry(
        &self,
        entry_id: &str,
    ) -> RepositoryResult<Vec<EpisodeProgress>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT entry_id, episode_number, watched, watched_at
             FROM episode_progresses
             WHERE entry_id = ?1
             ORDER BY episode_number ASC",
        )?;
        let progress = statement
            .query_map(params![entry_id], |row| {
                Ok(EpisodeProgress {
                    entry_id: row.get(0)?,
                    episode_number: row.get(1)?,
                    watched: row.get::<_, i64>(2)? != 0,
                    watched_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(progress)
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
            app: "animelib Windows".into(),
            format_version: 1,
            entries: self.list_entries()?,
            preferences: self.load_preferences()?,
        };
        Ok(serde_json::to_string_pretty(&payload)?)
    }

    pub fn restore_json(&self, payload_json: &str) -> RepositoryResult<()> {
        let payload = parse_export_payload(payload_json)?;
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

            CREATE TABLE IF NOT EXISTS anime_details (
                entry_id TEXT PRIMARY KEY NOT NULL,
                language TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT,
                overview TEXT,
                status TEXT,
                air_date TEXT,
                vote_average REAL,
                runtime_minutes INTEGER,
                episode_count INTEGER,
                season_count INTEGER,
                characters_json TEXT NOT NULL DEFAULT '[]',
                staff_json TEXT NOT NULL DEFAULT '[]',
                seasons_json TEXT NOT NULL,
                episodes_json TEXT NOT NULL,
                FOREIGN KEY(entry_id) REFERENCES anime_entries(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS episode_progresses (
                entry_id TEXT NOT NULL,
                episode_number INTEGER NOT NULL,
                watched INTEGER NOT NULL,
                watched_at TEXT,
                PRIMARY KEY(entry_id, episode_number),
                FOREIGN KEY(entry_id) REFERENCES anime_entries(id) ON DELETE CASCADE
            );
            ",
        )?;
        ensure_column(
            &connection,
            "anime_details",
            "characters_json",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        ensure_column(
            &connection,
            "anime_details",
            "staff_json",
            "TEXT NOT NULL DEFAULT '[]'",
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
        self.connection
            .lock()
            .map_err(|_| RepositoryError::LockPoisoned)
    }
}

fn parse_export_payload(payload_json: &str) -> RepositoryResult<ExportPayload> {
    match serde_json::from_str::<ExportPayload>(payload_json) {
        Ok(payload) => Ok(payload),
        Err(primary_error) => match serde_json::from_str::<IosLibraryExportPayload>(payload_json) {
            Ok(payload) if payload.app.as_deref() == Some("AniShelf") => Ok(ExportPayload {
                app: "AniShelf iOS Import".into(),
                format_version: 1,
                entries: payload
                    .entries
                    .into_iter()
                    .enumerate()
                    .map(|(index, record)| record.into_entry(index))
                    .collect(),
                preferences: AppPreferences::default(),
            }),
            _ => Err(RepositoryError::Serde(primary_error)),
        },
    }
}

impl IosLibraryExportRecord {
    fn into_entry(self, index: usize) -> AnimeEntry {
        let media_type = MediaType::from_str(&self.anime_type);
        let tmdb_id = tmdb_id_from_details_url(self.details_url.as_deref())
            .unwrap_or_else(|| fallback_tmdb_id(&self.title, index));
        let watch_status = watch_status_from_ios_export(self.watch_status.as_deref());
        let date_saved = if self.date_saved.trim().is_empty() {
            "1970-01-01T00:00:00Z".into()
        } else {
            self.date_saved
        };
        let id = entry_id(tmdb_id, &media_type, self.season_number);

        AnimeEntry {
            id,
            tmdb_id,
            media_type,
            season_number: self.season_number,
            parent_series_id: None,
            name: self.title,
            overview: None,
            poster_url: None,
            backdrop_url: None,
            details_url: self.details_url,
            original_language_code: None,
            on_air_date: self.release_date,
            watch_status,
            date_saved,
            date_started: self.date_started,
            date_finished: self.date_finished,
            is_date_tracking_enabled: true,
            score: self.score,
            favorite: self.favorite,
            notes: self.notes,
            using_custom_poster: self.using_custom_poster,
        }
    }
}

fn watch_status_from_ios_export(value: Option<&str>) -> WatchStatus {
    match value {
        Some("watching") => WatchStatus::Watching,
        Some("watched") => WatchStatus::Watched,
        Some("dropped") => WatchStatus::Dropped,
        _ => WatchStatus::PlanToWatch,
    }
}

fn tmdb_id_from_details_url(value: Option<&str>) -> Option<i64> {
    let value = value?;
    for marker in ["/movie/", "/tv/"] {
        let Some(marker_index) = value.find(marker) else {
            continue;
        };
        let suffix = &value[marker_index + marker.len()..];
        let digits: String = suffix
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect();
        if let Ok(id) = digits.parse::<i64>() {
            return Some(id);
        }
    }
    None
}

fn fallback_tmdb_id(title: &str, index: usize) -> i64 {
    let hash = title.bytes().fold(0_i64, |hash, byte| {
        (hash.wrapping_mul(31).wrapping_add(byte as i64)).rem_euclid(9_000_000)
    });
    -(hash + index as i64 + 1)
}

fn insert_entry_with_connection(
    connection: &Connection,
    entry: &AnimeEntry,
) -> RepositoryResult<()> {
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

fn row_to_detail(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnimeDetail> {
    Ok(AnimeDetail {
        entry_id: row.get(0)?,
        language: row.get(1)?,
        title: row.get(2)?,
        subtitle: row.get(3)?,
        overview: row.get(4)?,
        status: row.get(5)?,
        air_date: row.get(6)?,
        vote_average: row.get(7)?,
        runtime_minutes: row.get(8)?,
        episode_count: row.get(9)?,
        season_count: row.get(10)?,
        characters: Vec::new(),
        staff: Vec::new(),
        seasons: Vec::new(),
        episodes: Vec::new(),
    })
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> RepositoryResult<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|name| name == column) {
        connection.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}
