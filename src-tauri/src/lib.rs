pub mod models;
pub mod repository;

pub use models::*;
pub use repository::*;

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
}

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running AniShelf");
}
