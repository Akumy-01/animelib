use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaType {
    Movie,
    Series,
    Season,
}

impl MediaType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Series => "series",
            Self::Season => "season",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "series" => Self::Series,
            "season" => Self::Season,
            _ => Self::Movie,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WatchStatus {
    PlanToWatch,
    Watching,
    Watched,
    Dropped,
}

impl WatchStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PlanToWatch => "planToWatch",
            Self::Watching => "watching",
            Self::Watched => "watched",
            Self::Dropped => "dropped",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "watching" => Self::Watching,
            "watched" => Self::Watched,
            "dropped" => Self::Dropped,
            _ => Self::PlanToWatch,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryViewStyle {
    Gallery,
    List,
    Grid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySort {
    DateSaved,
    Title,
    ReleaseDate,
    Score,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BasicInfo {
    pub tmdb_id: i64,
    pub media_type: MediaType,
    pub season_number: Option<i64>,
    pub parent_series_id: Option<i64>,
    pub name: String,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub on_air_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnimeEntry {
    pub id: String,
    pub tmdb_id: i64,
    pub media_type: MediaType,
    pub season_number: Option<i64>,
    pub parent_series_id: Option<i64>,
    pub name: String,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub details_url: Option<String>,
    pub original_language_code: Option<String>,
    pub on_air_date: Option<String>,
    pub watch_status: WatchStatus,
    pub date_saved: String,
    pub date_started: Option<String>,
    pub date_finished: Option<String>,
    pub is_date_tracking_enabled: bool,
    pub score: Option<i64>,
    pub favorite: bool,
    pub notes: String,
    pub using_custom_poster: bool,
}

impl AnimeEntry {
    pub fn from_basic_info(info: BasicInfo) -> Self {
        Self {
            id: entry_id(info.tmdb_id, &info.media_type, info.season_number),
            tmdb_id: info.tmdb_id,
            media_type: info.media_type,
            season_number: info.season_number,
            parent_series_id: info.parent_series_id,
            name: info.name,
            overview: info.overview,
            poster_url: info.poster_url,
            backdrop_url: info.backdrop_url,
            details_url: None,
            original_language_code: None,
            on_air_date: info.on_air_date,
            watch_status: WatchStatus::PlanToWatch,
            date_saved: Utc::now().to_rfc3339(),
            date_started: None,
            date_finished: None,
            is_date_tracking_enabled: true,
            score: None,
            favorite: false,
            notes: String::new(),
            using_custom_poster: false,
        }
    }

    pub fn resolved_with_basic_info(self, info: BasicInfo) -> Self {
        let media_type = info.media_type;
        let season_number = info.season_number.or(self.season_number);
        let tmdb_id = info.tmdb_id;
        let details_url = tmdb_details_url(tmdb_id, &media_type, season_number);
        let has_custom_poster = self.using_custom_poster
            && self
                .poster_url
                .as_deref()
                .is_some_and(|url| !url.trim().is_empty());

        Self {
            id: entry_id(tmdb_id, &media_type, season_number),
            tmdb_id,
            media_type,
            season_number,
            parent_series_id: info.parent_series_id.or(self.parent_series_id),
            name: if info.name.trim().is_empty() {
                self.name
            } else {
                info.name
            },
            overview: info.overview.or(self.overview),
            poster_url: if has_custom_poster {
                self.poster_url
            } else {
                info.poster_url.or(self.poster_url)
            },
            backdrop_url: info.backdrop_url.or(self.backdrop_url),
            details_url: Some(details_url),
            original_language_code: self.original_language_code,
            on_air_date: info.on_air_date.or(self.on_air_date),
            watch_status: self.watch_status,
            date_saved: self.date_saved,
            date_started: self.date_started,
            date_finished: self.date_finished,
            is_date_tracking_enabled: self.is_date_tracking_enabled,
            score: self.score,
            favorite: self.favorite,
            notes: self.notes,
            using_custom_poster: has_custom_poster,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppPreferences {
    pub library_view_style: LibraryViewStyle,
    pub sort: LibrarySort,
    pub sort_reversed: bool,
    pub scoring_enabled: bool,
    pub preferred_language: String,
    pub theme: String,
    pub follow_system_language: bool,
    pub hide_dropped_by_default: bool,
    pub default_new_entry_watch_status: WatchStatus,
    pub default_status_filter: String,
    pub default_favorite_only: bool,
    pub open_detail_with_single_tap: bool,
    pub entry_detail_characters_expanded_by_default: bool,
    pub entry_detail_staff_expanded_by_default: bool,
    pub episode_progress_tracking_enabled: bool,
    pub poster_progress_bar_overlay_enabled: bool,
    pub auto_prefetch_images_on_add_and_restore: bool,
    pub use_tmdb_relay_server: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            library_view_style: LibraryViewStyle::Gallery,
            sort: LibrarySort::DateSaved,
            sort_reversed: false,
            scoring_enabled: true,
            preferred_language: "zh-CN".into(),
            theme: "warm".into(),
            follow_system_language: false,
            hide_dropped_by_default: false,
            default_new_entry_watch_status: WatchStatus::PlanToWatch,
            default_status_filter: "all".into(),
            default_favorite_only: false,
            open_detail_with_single_tap: false,
            entry_detail_characters_expanded_by_default: true,
            entry_detail_staff_expanded_by_default: false,
            episode_progress_tracking_enabled: false,
            poster_progress_bar_overlay_enabled: true,
            auto_prefetch_images_on_add_and_restore: false,
            use_tmdb_relay_server: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppStatePayload {
    pub entries: Vec<AnimeEntry>,
    pub preferences: AppPreferences,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnimeDetail {
    pub entry_id: String,
    pub language: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub overview: Option<String>,
    pub status: Option<String>,
    pub air_date: Option<String>,
    pub vote_average: Option<f64>,
    pub runtime_minutes: Option<i64>,
    pub episode_count: Option<i64>,
    pub season_count: Option<i64>,
    #[serde(default)]
    pub characters: Vec<CharacterSummary>,
    #[serde(default)]
    pub staff: Vec<StaffSummary>,
    pub seasons: Vec<SeasonSummary>,
    pub episodes: Vec<EpisodeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSummary {
    pub id: i64,
    pub character_name: String,
    pub actor_name: String,
    pub profile_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StaffSummary {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub department: Option<String>,
    pub profile_url: Option<String>,
    pub jobs: Vec<StaffJobSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StaffJobSummary {
    pub credit_id: String,
    pub job: String,
    pub episode_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SeasonSummary {
    pub id: i64,
    pub season_number: i64,
    pub title: String,
    pub poster_url: Option<String>,
    pub episode_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeSummary {
    pub id: i64,
    pub season_number: Option<i64>,
    pub episode_number: i64,
    pub title: String,
    pub air_date: Option<String>,
    pub image_url: Option<String>,
    pub overview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeProgress {
    pub entry_id: String,
    pub episode_number: i64,
    pub watched: bool,
    pub watched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PosterOption {
    pub id: String,
    pub url: String,
    pub preview_url: String,
    pub source: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub vote_average: Option<f64>,
    pub language: Option<String>,
}

pub fn entry_id(tmdb_id: i64, media_type: &MediaType, season_number: Option<i64>) -> String {
    match media_type {
        MediaType::Season => format!("season-{tmdb_id}-{}", season_number.unwrap_or_default()),
        MediaType::Series => format!("series-{tmdb_id}"),
        MediaType::Movie => format!("movie-{tmdb_id}"),
    }
}

pub fn tmdb_details_url(
    tmdb_id: i64,
    media_type: &MediaType,
    season_number: Option<i64>,
) -> String {
    match media_type {
        MediaType::Season => format!(
            "https://www.themoviedb.org/tv/{tmdb_id}/season/{}",
            season_number.unwrap_or_default()
        ),
        MediaType::Series => format!("https://www.themoviedb.org/tv/{tmdb_id}"),
        MediaType::Movie => format!("https://www.themoviedb.org/movie/{tmdb_id}"),
    }
}
