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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub library_view_style: LibraryViewStyle,
    pub sort: LibrarySort,
    pub sort_reversed: bool,
    pub scoring_enabled: bool,
    pub preferred_language: String,
    pub theme: String,
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

pub fn entry_id(tmdb_id: i64, media_type: &MediaType, season_number: Option<i64>) -> String {
    match media_type {
        MediaType::Season => format!("season-{tmdb_id}-{}", season_number.unwrap_or_default()),
        MediaType::Series => format!("series-{tmdb_id}"),
        MediaType::Movie => format!("movie-{tmdb_id}"),
    }
}
