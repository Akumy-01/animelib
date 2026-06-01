use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::models::{AnimeEntry, AppStatePayload, BasicInfo};
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
        let repository = LibraryRepository::open(app_dir.join("anishelf.sqlite"))
            .map_err(command_error)?;
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

#[tauri::command]
pub fn get_app_state(state: State<'_, AppRuntimeState>) -> Result<AppStatePayload, String> {
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub fn save_api_key(api_key: String, state: State<'_, AppRuntimeState>) -> Result<AppStatePayload, String> {
    state.repository.save_api_key(api_key.trim()).map_err(command_error)?;
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
    state
        .tmdb
        .search(&api_key, &request.query, &request.language)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_entry(info: BasicInfo, state: State<'_, AppRuntimeState>) -> Result<AnimeEntry, String> {
    let entry = AnimeEntry::from_basic_info(info);
    state.repository.insert_entry(&entry).map_err(command_error)?;
    Ok(entry)
}

#[tauri::command]
pub fn update_entry(entry: AnimeEntry, state: State<'_, AppRuntimeState>) -> Result<AnimeEntry, String> {
    state.repository.update_entry(&entry).map_err(command_error)?;
    Ok(entry)
}

#[tauri::command]
pub fn delete_entry(id: String, state: State<'_, AppRuntimeState>) -> Result<AppStatePayload, String> {
    state.repository.delete_entry(&id).map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

#[tauri::command]
pub fn export_library(state: State<'_, AppRuntimeState>) -> Result<String, String> {
    state.repository.export_json().map_err(command_error)
}

#[tauri::command]
pub fn create_backup(state: State<'_, AppRuntimeState>) -> Result<String, String> {
    state.repository.export_json().map_err(command_error)
}

#[tauri::command]
pub fn restore_backup(_backup_json: String, state: State<'_, AppRuntimeState>) -> Result<AppStatePayload, String> {
    state.repository.restore_json(&_backup_json).map_err(command_error)?;
    state.repository.app_state().map_err(command_error)
}

pub fn dev_database_path() -> PathBuf {
    PathBuf::from("anishelf-dev.sqlite")
}

fn command_error(error: RepositoryError) -> String {
    error.to_string()
}
