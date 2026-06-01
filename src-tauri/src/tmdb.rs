use serde::Deserialize;
use thiserror::Error;

use crate::models::{AnimeDetail, BasicInfo, EpisodeSummary, MediaType, SeasonSummary};

const TMDB_API_BASE: &str = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p/w500";
const ANIMATION_GENRE_ID: i64 = 16;

#[derive(Debug, Error)]
pub enum TmdbError {
    #[error("TMDb API key is missing")]
    MissingApiKey,
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("parse error: {0}")]
    Parse(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct TmdbClient {
    http: reqwest::Client,
}

impl Default for TmdbClient {
    fn default() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }
}

impl TmdbClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn search(&self, api_key: &str, query: &str, language: &str) -> Result<Vec<BasicInfo>, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }

        let movie_url = build_search_url("movie", query, language, 1);
        let series_url = build_search_url("tv", query, language, 1);
        let movies = self
            .http
            .get(movie_url)
            .query(&[("api_key", api_key)])
            .send()
            .await?
            .error_for_status()?
            .json::<TmdbListResponse<TmdbMovieResult>>()
            .await?;
        let series = self
            .http
            .get(series_url)
            .query(&[("api_key", api_key)])
            .send()
            .await?
            .error_for_status()?
            .json::<TmdbListResponse<TmdbSeriesResult>>()
            .await?;

        let mut results = Vec::new();
        results.extend(
            movies
                .results
                .into_iter()
                .filter(|movie| movie.genre_ids.contains(&ANIMATION_GENRE_ID))
                .map(TmdbMovieResult::into_basic_info),
        );
        results.extend(
            series
                .results
                .into_iter()
                .filter(|series| series.genre_ids.contains(&ANIMATION_GENRE_ID))
                .map(TmdbSeriesResult::into_basic_info),
        );
        Ok(results)
    }

    pub async fn series_detail(
        &self,
        api_key: &str,
        entry_id: &str,
        tmdb_id: i64,
        language: &str,
    ) -> Result<AnimeDetail, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }

        let json = self
            .http
            .get(build_detail_url("tv", tmdb_id, language))
            .query(&[("api_key", api_key)])
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        parse_series_detail_json(entry_id, language, &json).map_err(TmdbError::Parse)
    }
}

pub fn build_search_url(media_kind: &str, query: &str, language: &str, page: u32) -> String {
    format!(
        "{TMDB_API_BASE}/search/{media_kind}?query={}&language={language}&page={page}&include_adult=false",
        urlencoding::encode(query)
    )
}

pub fn build_detail_url(media_kind: &str, tmdb_id: i64, language: &str) -> String {
    format!("{TMDB_API_BASE}/{media_kind}/{tmdb_id}?language={language}")
}

pub fn parse_series_detail_json(
    entry_id: &str,
    language: &str,
    json: &str,
) -> Result<AnimeDetail, serde_json::Error> {
    let detail: TmdbSeriesDetail = serde_json::from_str(json)?;
    Ok(AnimeDetail {
        entry_id: entry_id.into(),
        language: language.into(),
        title: detail.name,
        subtitle: detail.tagline.filter(|value| !value.is_empty()),
        overview: detail.overview.filter(|value| !value.is_empty()),
        status: detail.status.filter(|value| !value.is_empty()),
        air_date: detail.first_air_date.filter(|value| !value.is_empty()),
        vote_average: detail.vote_average,
        runtime_minutes: detail.episode_run_time.and_then(|items| items.first().copied()),
        episode_count: detail.number_of_episodes,
        season_count: detail.number_of_seasons,
        seasons: detail
            .seasons
            .unwrap_or_default()
            .into_iter()
            .map(|season| SeasonSummary {
                id: season.id,
                season_number: season.season_number,
                title: season.name,
                poster_url: image_url(season.poster_path),
                episode_count: season.episode_count,
            })
            .collect(),
        episodes: Vec::<EpisodeSummary>::new(),
    })
}

#[derive(Debug, Deserialize)]
struct TmdbListResponse<T> {
    results: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct TmdbMovieResult {
    id: i64,
    title: String,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    release_date: Option<String>,
    genre_ids: Vec<i64>,
}

impl TmdbMovieResult {
    fn into_basic_info(self) -> BasicInfo {
        BasicInfo {
            tmdb_id: self.id,
            media_type: MediaType::Movie,
            season_number: None,
            parent_series_id: None,
            name: self.title,
            overview: self.overview,
            poster_url: image_url(self.poster_path),
            backdrop_url: image_url(self.backdrop_path),
            on_air_date: self.release_date.filter(|date| !date.is_empty()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct TmdbSeriesResult {
    id: i64,
    name: String,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    first_air_date: Option<String>,
    genre_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct TmdbSeriesDetail {
    name: String,
    tagline: Option<String>,
    overview: Option<String>,
    status: Option<String>,
    first_air_date: Option<String>,
    vote_average: Option<f64>,
    episode_run_time: Option<Vec<i64>>,
    number_of_episodes: Option<i64>,
    number_of_seasons: Option<i64>,
    seasons: Option<Vec<TmdbSeasonSummary>>,
}

#[derive(Debug, Deserialize)]
struct TmdbSeasonSummary {
    id: i64,
    season_number: i64,
    name: String,
    poster_path: Option<String>,
    episode_count: Option<i64>,
}

impl TmdbSeriesResult {
    fn into_basic_info(self) -> BasicInfo {
        BasicInfo {
            tmdb_id: self.id,
            media_type: MediaType::Series,
            season_number: None,
            parent_series_id: None,
            name: self.name,
            overview: self.overview,
            poster_url: image_url(self.poster_path),
            backdrop_url: image_url(self.backdrop_path),
            on_air_date: self.first_air_date.filter(|date| !date.is_empty()),
        }
    }
}

fn image_url(path: Option<String>) -> Option<String> {
    path.map(|path| format!("{TMDB_IMAGE_BASE}{path}"))
}
