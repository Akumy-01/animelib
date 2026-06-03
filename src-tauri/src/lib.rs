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
    fn resolves_imported_placeholder_entry_from_basic_info() {
        let entry = AnimeEntry {
            id: "series--6399189".into(),
            tmdb_id: -6399189,
            media_type: MediaType::Series,
            season_number: None,
            parent_series_id: None,
            name: "鎭堕瓟浜猴細鍝常涔嬪瓙".into(),
            overview: None,
            poster_url: None,
            backdrop_url: None,
            details_url: Some("https://devilman-crybaby.com".into()),
            original_language_code: None,
            on_air_date: None,
            watch_status: WatchStatus::Watching,
            date_saved: "2026-06-01T00:00:00Z".into(),
            date_started: Some("2026-06-01".into()),
            date_finished: None,
            is_date_tracking_enabled: true,
            score: Some(5),
            favorite: true,
            notes: "keep me".into(),
            using_custom_poster: false,
        };
        let info = BasicInfo {
            tmdb_id: 75208,
            media_type: MediaType::Series,
            season_number: None,
            parent_series_id: None,
            name: "鎭堕瓟浜猴細鍝常涔嬪瓙".into(),
            overview: Some("TMDb overview".into()),
            poster_url: Some("https://image.tmdb.org/t/p/original/poster.jpg".into()),
            backdrop_url: Some("https://image.tmdb.org/t/p/original/backdrop.jpg".into()),
            on_air_date: Some("2018-01-05".into()),
        };

        let resolved = entry.resolved_with_basic_info(info);

        assert_eq!(resolved.id, "series-75208");
        assert_eq!(resolved.tmdb_id, 75208);
        assert_eq!(
            resolved.poster_url.as_deref(),
            Some("https://image.tmdb.org/t/p/original/poster.jpg")
        );
        assert_eq!(
            resolved.details_url.as_deref(),
            Some("https://www.themoviedb.org/tv/75208")
        );
        assert_eq!(resolved.watch_status, WatchStatus::Watching);
        assert_eq!(resolved.notes, "keep me");
    }

    #[test]
    fn resolved_entry_uses_tmdb_poster_when_custom_poster_flag_has_no_image() {
        let entry = AnimeEntry {
            id: "series--1".into(),
            tmdb_id: -1,
            media_type: MediaType::Series,
            season_number: None,
            parent_series_id: None,
            name: "Missing poster".into(),
            overview: None,
            poster_url: None,
            backdrop_url: None,
            details_url: None,
            original_language_code: None,
            on_air_date: None,
            watch_status: WatchStatus::PlanToWatch,
            date_saved: "2026-06-01T00:00:00Z".into(),
            date_started: None,
            date_finished: None,
            is_date_tracking_enabled: true,
            score: None,
            favorite: false,
            notes: String::new(),
            using_custom_poster: true,
        };
        let info = BasicInfo {
            tmdb_id: 75208,
            media_type: MediaType::Series,
            season_number: None,
            parent_series_id: None,
            name: "Resolved".into(),
            overview: None,
            poster_url: Some("https://image.tmdb.org/t/p/original/poster.jpg".into()),
            backdrop_url: None,
            on_air_date: None,
        };

        let resolved = entry.resolved_with_basic_info(info);

        assert_eq!(
            resolved.poster_url.as_deref(),
            Some("https://image.tmdb.org/t/p/original/poster.jpg")
        );
        assert!(!resolved.using_custom_poster);
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

        repo.insert_entry(&AnimeEntry::from_basic_info(info))
            .expect("insert");

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
    fn tmdb_search_url_can_use_relay_base() {
        let url = build_search_url_with_base(
            "https://tmdb-api.konakona52.com/3",
            "tv",
            "Frieren",
            "zh-CN",
            1,
        );

        assert!(url.starts_with("https://tmdb-api.konakona52.com/3/search/tv"));
    }

    #[test]
    fn tmdb_requests_use_official_alias_and_optional_relay() {
        assert_eq!(
            tmdb_base_urls(false),
            vec!["https://api.tmdb.org/3", "https://api.themoviedb.org/3"]
        );
        assert_eq!(
            tmdb_base_urls(true),
            vec![
                "https://tmdb-api.konakona52.com/3",
                "https://api.tmdb.org/3",
                "https://api.themoviedb.org/3"
            ]
        );
    }

    #[test]
    fn repository_restores_export_payload() {
        let source_dir = tempfile::tempdir().expect("source temp dir");
        let source =
            LibraryRepository::open(source_dir.path().join("library.sqlite")).expect("source repo");
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
        source
            .insert_entry(&AnimeEntry::from_basic_info(info))
            .expect("insert source");
        let payload = source.export_json().expect("export");

        let target_dir = tempfile::tempdir().expect("target temp dir");
        let target =
            LibraryRepository::open(target_dir.path().join("library.sqlite")).expect("target repo");
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
        target
            .insert_entry(&AnimeEntry::from_basic_info(old_info))
            .expect("insert old");

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
            follow_system_language: false,
            hide_dropped_by_default: true,
            default_new_entry_watch_status: WatchStatus::Watching,
            default_status_filter: "watching".into(),
            default_favorite_only: true,
            open_detail_with_single_tap: true,
            entry_detail_characters_expanded_by_default: true,
            entry_detail_staff_expanded_by_default: false,
            episode_progress_tracking_enabled: true,
            poster_progress_bar_overlay_enabled: true,
            auto_prefetch_images_on_add_and_restore: true,
            use_tmdb_relay_server: false,
        };

        repo.save_preferences(&preferences)
            .expect("save preferences");

        let saved = repo.load_preferences().expect("load preferences");
        assert_eq!(saved.library_view_style, LibraryViewStyle::List);
        assert_eq!(saved.sort, LibrarySort::Title);
        assert!(saved.sort_reversed);
        assert_eq!(saved.preferred_language, "ja-JP");
        assert!(saved.hide_dropped_by_default);
        assert_eq!(saved.default_new_entry_watch_status, WatchStatus::Watching);
        assert!(saved.episode_progress_tracking_enabled);
    }

    #[test]
    fn repository_restores_older_export_with_defaulted_preferences() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = LibraryRepository::open(temp.path().join("library.sqlite")).expect("repo");
        let payload = r#"{
            "app": "animelib Windows",
            "formatVersion": 1,
            "entries": [],
            "preferences": {
                "libraryViewStyle": "gallery",
                "sort": "dateSaved",
                "sortReversed": false,
                "scoringEnabled": true,
                "preferredLanguage": "zh-CN",
                "theme": "warm"
            }
        }"#;

        repo.restore_json(payload).expect("restore older export");

        let saved = repo.load_preferences().expect("preferences");
        assert_eq!(
            saved.default_new_entry_watch_status,
            WatchStatus::PlanToWatch
        );
        assert_eq!(saved.default_status_filter, "all");
        assert!(!saved.episode_progress_tracking_enabled);
    }

    #[test]
    fn repository_restores_ios_library_export_payload() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = LibraryRepository::open(temp.path().join("library.sqlite")).expect("repo");
        let payload = r#"{
            "app": "AniShelf",
            "formatVersion": 1,
            "exportedAt": "2026-05-30T10:00:00Z",
            "entryCount": 1,
            "entries": [
                {
                    "title": "Frieren: Beyond Journey's End",
                    "parentSeriesTitle": null,
                    "releaseYear": 2023,
                    "releaseDate": "2023-09-29",
                    "animeType": "series",
                    "seasonNumber": null,
                    "detailsURL": "https://www.themoviedb.org/tv/154521",
                    "dateSaved": "2026-02-03T10:00:00Z",
                    "watchStatus": "planned",
                    "dateStarted": null,
                    "dateFinished": null,
                    "score": 5,
                    "favorite": true,
                    "notes": "Imported from iOS",
                    "usingCustomPoster": false
                }
            ]
        }"#;

        repo.restore_json(payload).expect("restore ios export");

        let entries = repo.list_entries().expect("entries");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "series-154521");
        assert_eq!(entries[0].tmdb_id, 154521);
        assert_eq!(entries[0].watch_status, WatchStatus::PlanToWatch);
        assert!(entries[0].favorite);
        assert_eq!(entries[0].notes, "Imported from iOS");
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
            characters: vec![CharacterSummary {
                id: 801,
                character_name: "Hero".into(),
                actor_name: "Actor A".into(),
                profile_url: Some("https://image.tmdb.org/t/p/original/profile.jpg".into()),
            }],
            staff: vec![StaffSummary {
                id: 901,
                name: "Director A".into(),
                role: "Director".into(),
                department: Some("Directing".into()),
                profile_url: None,
                jobs: vec![StaffJobSummary {
                    credit_id: "credit-1".into(),
                    job: "Director".into(),
                    episode_count: 12,
                }],
            }],
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
                    season_number: Some(1),
                    episode_number: 1,
                    title: "Departure".into(),
                    air_date: Some("2024-01-01".into()),
                    image_url: None,
                    overview: Some("Episode one".into()),
                },
                EpisodeSummary {
                    id: 9002,
                    season_number: Some(1),
                    episode_number: 2,
                    title: "Companion".into(),
                    air_date: Some("2024-01-08".into()),
                    image_url: None,
                    overview: None,
                },
            ],
        };

        repo.save_detail(&detail).expect("save detail");
        repo.set_episode_watched(&entry.id, 1, true)
            .expect("watch episode");

        let saved = repo
            .detail_for_entry(&entry.id)
            .expect("detail")
            .expect("detail exists");
        let progress = repo
            .episode_progress_for_entry(&entry.id)
            .expect("progress");
        assert_eq!(saved.characters[0].character_name, "Hero");
        assert_eq!(saved.staff[0].name, "Director A");
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
                "aggregate_credits": {
                    "cast": [
                        {
                            "id": 10,
                            "name": "Atsumi Tanezaki",
                            "original_name": "绋☉鏁︾編",
                            "profile_path": "/actor.jpg",
                            "roles": [{"character": "Frieren (voice)", "episode_count": 12}]
                        }
                    ],
                    "crew": [
                        {
                            "id": 20,
                            "name": "Keiichiro Saito",
                            "original_name": "Keiichiro Saito",
                            "known_for_department": "Directing",
                            "profile_path": "/director.jpg",
                            "jobs": [{"credit_id": "abc", "job": "Director", "episode_count": 12}]
                        }
                    ]
                },
                "seasons": [
                    {"id": 7, "season_number": 1, "name": "Season 1", "poster_path": "/poster.jpg", "episode_count": 12}
                ]
            }"#,
        )
        .expect("detail");

        assert_eq!(detail.title, "Series Title");
        assert_eq!(detail.characters[0].character_name, "Frieren");
        assert_eq!(
            detail.characters[0].profile_url.as_deref(),
            Some("https://image.tmdb.org/t/p/original/actor.jpg")
        );
        assert_eq!(detail.staff[0].role, "Directing");
        assert_eq!(detail.staff[0].jobs[0].job, "Director");
        assert_eq!(detail.seasons[0].season_number, 1);
        assert_eq!(detail.runtime_minutes, Some(24));
    }

    #[test]
    fn maps_tmdb_detail_when_credit_fields_are_sparse() {
        let detail = parse_series_detail_json(
            "series-75208",
            "zh-CN",
            r#"{
                "name": "Devilman Crybaby",
                "aggregate_credits": {
                    "cast": [
                        {"id": 1, "name": "Actor", "roles": [{"character": "Hero"}]}
                    ],
                    "crew": [
                        {"id": 2, "name": "Director", "jobs": [{"job": "Director"}]}
                    ]
                },
                "seasons": [
                    {"id": 10, "season_number": 1, "name": "Season 1", "episode_count": 10}
                ]
            }"#,
        )
        .expect("detail");

        assert_eq!(detail.characters[0].character_name, "Hero");
        assert_eq!(detail.staff[0].jobs[0].job, "Director");
        assert_eq!(detail.staff[0].jobs[0].episode_count, 0);
    }

    #[test]
    fn maps_tmdb_season_json_to_episode_summaries() {
        let episodes = parse_season_episode_json(
            1,
            0,
            r#"{
                "episodes": [
                    {
                        "id": 1001,
                        "episode_number": 1,
                        "name": "The Journey's End",
                        "air_date": "2023-09-29",
                        "still_path": "/episode.jpg",
                        "overview": "A quiet first episode."
                    }
                ]
            }"#,
        )
        .expect("episodes");

        assert_eq!(episodes[0].season_number, Some(1));
        assert_eq!(episodes[0].episode_number, 1);
        assert_eq!(episodes[0].title, "The Journey's End");
        assert_eq!(
            episodes[0].image_url.as_deref(),
            Some("https://image.tmdb.org/t/p/original/episode.jpg")
        );
        assert_eq!(
            episodes[0].overview.as_deref(),
            Some("A quiet first episode.")
        );
    }

    #[test]
    fn maps_tmdb_specials_json_to_episode_summaries() {
        let episodes = parse_season_episode_json(
            0,
            0,
            r#"{
                "episodes": [
                    {
                        "id": 9001,
                        "episode_number": 1,
                        "name": "Special Episode",
                        "still_path": "/special.jpg",
                        "overview": "A side story."
                    }
                ]
            }"#,
        )
        .expect("special episodes");

        assert_eq!(episodes[0].season_number, Some(0));
        assert_eq!(episodes[0].episode_number, 1);
        assert_eq!(episodes[0].title, "Special Episode");
    }

    #[test]
    fn maps_tmdb_images_json_to_poster_options() {
        let options = parse_poster_options_json(
            r#"{
                "id": 154521,
                "posters": [
                    {
                        "file_path": "/low.jpg",
                        "width": 500,
                        "height": 750,
                        "vote_average": 4.2,
                        "iso_639_1": "en"
                    },
                    {
                        "file_path": "/high.jpg",
                        "width": 1000,
                        "height": 1500,
                        "vote_average": 8.7,
                        "iso_639_1": "zh"
                    }
                ]
            }"#,
        )
        .expect("poster options");

        assert_eq!(options.len(), 2);
        assert_eq!(options[0].id, "high.jpg");
        assert_eq!(options[0].url, "https://image.tmdb.org/t/p/original/high.jpg");
        assert_eq!(
            options[0].preview_url,
            "https://image.tmdb.org/t/p/original/high.jpg"
        );
        assert_eq!(options[0].language.as_deref(), Some("zh"));
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            poster_options_for_entry,
            refresh_entry_detail,
            set_episode_watched,
            episode_progress_for_entry,
            delete_entry,
            export_library,
            export_library_to_path,
            create_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running animelib");
}
