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

    #[test]
    fn repository_persists_preferences() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = LibraryRepository::open(temp.path().join("library.sqlite")).expect("repo");
        let preferences = AppPreferences {
            library_view_style: LibraryViewStyle::List,
            sort: LibrarySort::Title,
            sort_reversed: true,
            scoring_enabled: true,
            preferred_language: "ja-JP".into(),
            theme: "warm".into(),
        };

        repo.save_preferences(&preferences).expect("save preferences");

        let saved = repo.load_preferences().expect("load preferences");
        assert_eq!(saved.library_view_style, LibraryViewStyle::List);
        assert_eq!(saved.sort, LibrarySort::Title);
        assert!(saved.sort_reversed);
        assert_eq!(saved.preferred_language, "ja-JP");
    }

    #[test]
    fn repository_persists_detail_and_episode_progress() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = LibraryRepository::open(temp.path().join("library.sqlite")).expect("repo");
        let info = BasicInfo {
            tmdb_id: 101,
            media_type: MediaType::Series,
            name: "Detail Series".into(),
            overview: None,
            poster_url: None,
            backdrop_url: None,
            on_air_date: None,
            season_number: None,
            parent_series_id: None,
        };
        let entry = AnimeEntry::from_basic_info(info);
        repo.insert_entry(&entry).expect("insert entry");

        let detail = AnimeDetail {
            entry_id: entry.id.clone(),
            language: "zh-CN".into(),
            title: "Detail Series".into(),
            subtitle: Some("Season overview".into()),
            overview: Some("Long overview".into()),
            status: Some("Returning Series".into()),
            air_date: Some("2024-01-01".into()),
            vote_average: Some(8.7),
            runtime_minutes: Some(24),
            episode_count: Some(12),
            season_count: Some(1),
            seasons: vec![SeasonSummary {
                id: 501,
                season_number: 1,
                title: "Season 1".into(),
                poster_url: None,
                episode_count: Some(12),
            }],
            episodes: vec![
                EpisodeSummary {
                    id: 9001,
                    episode_number: 1,
                    title: "Departure".into(),
                    air_date: Some("2024-01-01".into()),
                    image_url: None,
                    overview: Some("Episode one".into()),
                },
                EpisodeSummary {
                    id: 9002,
                    episode_number: 2,
                    title: "Companion".into(),
                    air_date: Some("2024-01-08".into()),
                    image_url: None,
                    overview: None,
                },
            ],
        };

        repo.save_detail(&detail).expect("save detail");
        repo.set_episode_watched(&entry.id, 1, true).expect("watch episode");

        let saved = repo.detail_for_entry(&entry.id).expect("detail").expect("detail exists");
        let progress = repo.episode_progress_for_entry(&entry.id).expect("progress");
        assert_eq!(saved.episodes.len(), 2);
        assert_eq!(saved.seasons[0].title, "Season 1");
        assert_eq!(progress[0].episode_number, 1);
        assert!(progress[0].watched);
    }

    #[test]
    fn maps_tmdb_series_detail_to_anime_detail() {
        let detail = parse_series_detail_json(
            "series-42",
            "zh-CN",
            r#"{
                "name": "Series Title",
                "tagline": "A quiet tagline",
                "overview": "Series overview",
                "status": "Returning Series",
                "first_air_date": "2024-04-01",
                "vote_average": 8.9,
                "episode_run_time": [24],
                "number_of_episodes": 12,
                "number_of_seasons": 1,
                "seasons": [
                    {"id": 7, "season_number": 1, "name": "Season 1", "poster_path": "/poster.jpg", "episode_count": 12}
                ]
            }"#,
        )
        .expect("detail");

        assert_eq!(detail.title, "Series Title");
        assert_eq!(detail.seasons[0].season_number, 1);
        assert_eq!(detail.runtime_minutes, Some(24));
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
            save_preferences,
            search_tmdb,
            add_entry,
            update_entry,
            save_detail,
            detail_for_entry,
            refresh_entry_detail,
            set_episode_watched,
            episode_progress_for_entry,
            delete_entry,
            export_library,
            create_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running AniShelf");
}
