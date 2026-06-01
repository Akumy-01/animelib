pub mod commands;
pub mod models;
pub mod repository;
pub mod tmdb;

use tauri::Manager;

pub use commands::*;
pub use models::*;
pub use repository::*;
pub use tmdb::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_default_entry_from_basic_info() {
        let info = BasicInfo {
            tmdb_id: 42,
            media_type: MediaType::Movie,
            name: "Akira".into(),
            overview: Some("Neo Tokyo".into()),
            poster_url: None,
            backdrop_url: None,
            on_air_date: Some("1988-07-16".into()),
            season_number: None,
            parent_series_id: None,
        };

        let entry = AnimeEntry::from_basic_info(info);

        assert_eq!(entry.watch_status, WatchStatus::PlanToWatch);
        assert_eq!(entry.score, None);
        assert!(!entry.favorite);
    }

    #[test]
    fn repository_inserts_and_lists_entries() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = LibraryRepository::open(temp.path().join("library.sqlite")).expect("repo");
        let info = BasicInfo {
            tmdb_id: 77,
            media_type: MediaType::Series,
            name: "Test Series".into(),
            overview: None,
            poster_url: None,
            backdrop_url: None,
            on_air_date: None,
            season_number: None,
            parent_series_id: None,
        };

        repo.insert_entry(&AnimeEntry::from_basic_info(info)).expect("insert");

        let entries = repo.list_entries().expect("entries");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Test Series");
        assert_eq!(entries[0].watch_status, WatchStatus::PlanToWatch);
    }

    #[test]
    fn tmdb_search_url_encodes_query_and_language() {
        let url = build_search_url("tv", "Frieren Beyond Journey", "zh-CN", 1);
        assert!(url.contains("Frieren%20Beyond%20Journey"));
        assert!(url.contains("language=zh-CN"));
        assert!(url.contains("page=1"));
    }

    #[test]
    fn repository_restores_export_payload() {
        let source_dir = tempfile::tempdir().expect("source temp dir");
        let source = LibraryRepository::open(source_dir.path().join("library.sqlite")).expect("source repo");
        let info = BasicInfo {
            tmdb_id: 88,
            media_type: MediaType::Movie,
            name: "Restored Movie".into(),
            overview: Some("From backup".into()),
            poster_url: None,
            backdrop_url: None,
            on_air_date: Some("2020-01-01".into()),
            season_number: None,
            parent_series_id: None,
        };
        source.insert_entry(&AnimeEntry::from_basic_info(info)).expect("insert source");
        let payload = source.export_json().expect("export");

        let target_dir = tempfile::tempdir().expect("target temp dir");
        let target = LibraryRepository::open(target_dir.path().join("library.sqlite")).expect("target repo");
        let old_info = BasicInfo {
            tmdb_id: 99,
            media_type: MediaType::Series,
            name: "Old Entry".into(),
            overview: None,
            poster_url: None,
            backdrop_url: None,
            on_air_date: None,
            season_number: None,
            parent_series_id: None,
        };
        target.insert_entry(&AnimeEntry::from_basic_info(old_info)).expect("insert old");

        target.restore_json(&payload).expect("restore");

        let entries = target.list_entries().expect("entries");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Restored Movie");
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = AppRuntimeState::initialize(app.handle())
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_api_key,
            search_tmdb,
            add_entry,
            update_entry,
            delete_entry,
            export_library,
            create_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running AniShelf");
}
