use serde::Deserialize;
use thiserror::Error;

use crate::models::{BasicInfo, MediaType};

const TMDB_API_BASE: &str = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p/w500";
const ANIMATION_GENRE_ID: i64 = 16;

#[derive(Debug, Error)]
pub enum TmdbError {
    #[error("TMDb API key is missing")]
    MissingApiKey,
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
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
}

pub fn build_search_url(media_kind: &str, query: &str, language: &str, page: u32) -> String {
    format!(
        "{TMDB_API_BASE}/search/{media_kind}?query={}&language={language}&page={page}&include_adult=false",
        urlencoding::encode(query)
    )
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
