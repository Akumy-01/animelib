use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::models::{
    AnimeDetail, AnimeEntry, AppPreferences, AppStatePayload, BasicInfo, EpisodeProgress,
    MediaType, PosterOption,
};
use crate::repository::{LibraryRepository, RepositoryError};
use crate::tmdb::{TmdbClient, TmdbError};

pub struct AppRuntimeState {
    pub repository: LibraryRepository,
    pub tmdb: TmdbClient,
}

impl AppRuntimeState {
    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
        let repository =
            LibraryRepository::open(app_dir.join("anishelf.sqlite")).map_err(command_error)?;
        Ok(Self {
            repository,
            tmdb: TmdbClient::new(),
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    pub language: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshDetailPayload {
    pub entry: AnimeEntry,
    pub detail: AnimeDetail,
}

#[tauri::command]
pub fn get_app_state(state: State<'_, AppRuntimeState>) -> Result<AppStatePayload, String> {
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub fn save_api_key(
    api_key: String,
    state: State<'_, AppRuntimeState>,
) -> Result<AppStatePayload, String> {
    state
        .repository
        .save_api_key(api_key.trim())
        .map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub fn save_preferences(
    preferences: AppPreferences,
    state: State<'_, AppRuntimeState>,
) -> Result<AppStatePayload, String> {
    state
        .repository
        .save_preferences(&preferences)
        .map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub async fn search_tmdb(
    request: SearchRequest,
    state: State<'_, AppRuntimeState>,
) -> Result<Vec<BasicInfo>, String> {
    let api_key = state
        .repository
        .api_key()
        .map_err(command_error)?
        .ok_or_else(|| TmdbError::MissingApiKey.to_string())?;
    let preferences = state.repository.load_preferences().map_err(command_error)?;
    state
        .tmdb
        .search(
            &api_key,
            &request.query,
            &request.language,
            preferences.use_tmdb_relay_server,
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_entry(info: BasicInfo, state: State<'_, AppRuntimeState>) -> Result<AnimeEntry, String> {
    let entry = AnimeEntry::from_basic_info(info);
    state
        .repository
        .insert_entry(&entry)
        .map_err(command_error)?;
    Ok(entry)
}

#[tauri::command]
pub fn update_entry(
    entry: AnimeEntry,
    state: State<'_, AppRuntimeState>,
) -> Result<AnimeEntry, String> {
    state
        .repository
        .update_entry(&entry)
        .map_err(command_error)?;
    Ok(entry)
}

#[tauri::command]
pub fn save_detail(
    detail: AnimeDetail,
    state: State<'_, AppRuntimeState>,
) -> Result<AnimeDetail, String> {
    state
        .repository
        .save_detail(&detail)
        .map_err(command_error)?;
    Ok(detail)
}

#[tauri::command]
pub fn detail_for_entry(
    entry_id: String,
    state: State<'_, AppRuntimeState>,
) -> Result<Option<AnimeDetail>, String> {
    state
        .repository
        .detail_for_entry(&entry_id)
        .map_err(command_error)
}

#[tauri::command]
pub async fn poster_options_for_entry(
    entry: AnimeEntry,
    state: State<'_, AppRuntimeState>,
) -> Result<Vec<PosterOption>, String> {
    let api_key = state
        .repository
        .api_key()
        .map_err(command_error)?
        .ok_or_else(|| "TMDb API key is missing".to_string())?;
    let preferences = state.repository.load_preferences().map_err(command_error)?;
    state
        .tmdb
        .poster_options(
            &api_key,
            entry.tmdb_id,
            &entry.media_type,
            preferences.use_tmdb_relay_server,
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn refresh_entry_detail(
    entry: AnimeEntry,
    language: String,
    state: State<'_, AppRuntimeState>,
) -> Result<RefreshDetailPayload, String> {
    let api_key = state
        .repository
        .api_key()
        .map_err(command_error)?
        .ok_or_else(|| "TMDb API key is missing".to_string())?;
    let preferences = state.repository.load_preferences().map_err(command_error)?;
    let original_entry_id = entry.id.clone();
    let entry =
        resolve_entry_metadata_if_needed(entry, &api_key, &language, &preferences, state.inner())
            .await
            .map_err(|error| error.to_string())?;
    state
        .repository
        .update_entry(&entry)
        .map_err(command_error)?;
    if original_entry_id != entry.id {
        state
            .repository
            .delete_entry(&original_entry_id)
            .map_err(command_error)?;
    }

    let detail = match entry.media_type {
        MediaType::Series => state
            .tmdb
            .series_detail(
                &api_key,
                &entry.id,
                entry.tmdb_id,
                &language,
                preferences.use_tmdb_relay_server,
            )
            .await
            .map_err(|error| error.to_string())?,
        MediaType::Movie | MediaType::Season => AnimeDetail {
            entry_id: entry.id.clone(),
            language,
            title: entry.name.clone(),
            subtitle: None,
            overview: entry.overview.clone(),
            status: None,
            air_date: entry.on_air_date.clone(),
            vote_average: None,
            runtime_minutes: None,
            episode_count: None,
            season_count: None,
            characters: Vec::new(),
            staff: Vec::new(),
            seasons: Vec::new(),
            episodes: Vec::new(),
        },
    };
    state
        .repository
        .save_detail(&detail)
        .map_err(command_error)?;
    Ok(RefreshDetailPayload { entry, detail })
}

#[tauri::command]
pub fn set_episode_watched(
    entry_id: String,
    episode_number: i64,
    watched: bool,
    state: State<'_, AppRuntimeState>,
) -> Result<Vec<EpisodeProgress>, String> {
    state
        .repository
        .set_episode_watched(&entry_id, episode_number, watched)
        .map_err(command_error)?;
    state
        .repository
        .episode_progress_for_entry(&entry_id)
        .map_err(command_error)
}

#[tauri::command]
pub fn episode_progress_for_entry(
    entry_id: String,
    state: State<'_, AppRuntimeState>,
) -> Result<Vec<EpisodeProgress>, String> {
    state
        .repository
        .episode_progress_for_entry(&entry_id)
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_entry(
    id: String,
    state: State<'_, AppRuntimeState>,
) -> Result<AppStatePayload, String> {
    state.repository.delete_entry(&id).map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub fn export_library(state: State<'_, AppRuntimeState>) -> Result<String, String> {
    state.repository.export_json().map_err(command_error)
}

#[tauri::command]
pub fn export_library_to_path(
    path: String,
    state: State<'_, AppRuntimeState>,
) -> Result<(), String> {
    let payload = state.repository.export_json().map_err(command_error)?;
    std::fs::write(&path, payload).map_err(|error| format!("Could not write JSON backup: {error}"))
}

#[tauri::command]
pub fn create_backup(state: State<'_, AppRuntimeState>) -> Result<String, String> {
    state.repository.export_json().map_err(command_error)
}

#[tauri::command]
pub fn restore_backup(
    _backup_json: String,
    state: State<'_, AppRuntimeState>,
) -> Result<AppStatePayload, String> {
    state
        .repository
        .restore_json(&_backup_json)
        .map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

async fn resolve_entry_metadata_if_needed(
    entry: AnimeEntry,
    api_key: &str,
    language: &str,
    preferences: &AppPreferences,
    state: &AppRuntimeState,
) -> Result<AnimeEntry, TmdbError> {
    if !needs_metadata_resolution(&entry) {
        return Ok(entry);
    }

    let results = state
        .tmdb
        .search_media(
            api_key,
            &entry.name,
            language,
            &entry.media_type,
            preferences.use_tmdb_relay_server,
        )
        .await?;
    let Some(info) = best_metadata_match(&entry, results) else {
        return Err(TmdbError::NotFound(format!(
            "未找到 \"{}\" 的 TMDb 动画结果",
            entry.name
        )));
    };

    Ok(entry.resolved_with_basic_info(info))
}

fn needs_metadata_resolution(entry: &AnimeEntry) -> bool {
    entry.tmdb_id <= 0
        || entry.overview.as_deref().is_none_or(str::is_empty)
        || entry.poster_url.as_deref().is_none_or(str::is_empty)
}

fn best_metadata_match(entry: &AnimeEntry, results: Vec<BasicInfo>) -> Option<BasicInfo> {
    results
        .iter()
        .position(|info| info.media_type == entry.media_type)
        .and_then(|index| results.get(index).cloned())
        .or_else(|| results.into_iter().next())
}

pub fn dev_database_path() -> PathBuf {
    PathBuf::from("anishelf-dev.sqlite")
}

fn command_error(error: RepositoryError) -> String {
    error.to_string()
}
