use serde::Deserialize;
use std::error::Error;
use thiserror::Error;

use crate::models::{
    AnimeDetail, BasicInfo, CharacterSummary, EpisodeSummary, MediaType, PosterOption,
    SeasonSummary, StaffJobSummary, StaffSummary,
};

const TMDB_API_BASE: &str = "https://api.themoviedb.org/3";
const TMDB_API_ALIAS_BASE: &str = "https://api.tmdb.org/3";
const TMDB_RELAY_BASE: &str = "https://tmdb-api.konakona52.com/3";
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p/original";
const TMDB_POSTER_PREVIEW_BASE: &str = "https://image.tmdb.org/t/p/original";
const TMDB_PROFILE_BASE: &str = "https://image.tmdb.org/t/p/original";
const ANIMATION_GENRE_ID: i64 = 16;

#[derive(Debug, Error)]
pub enum TmdbError {
    #[error("TMDb API key is missing")]
    MissingApiKey,
    #[error("{0}")]
    NotFound(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("parse error: {0}")]
    Parse(#[from] serde_json::Error),
}

impl From<reqwest::Error> for TmdbError {
    fn from(error: reqwest::Error) -> Self {
        Self::Network(reqwest_error_message(error))
    }
}

#[derive(Clone)]
pub struct TmdbClient {
    http: reqwest::Client,
}

impl Default for TmdbClient {
    fn default() -> Self {
        Self {
            http: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(6))
                .timeout(std::time::Duration::from_secs(18))
                .build()
                .expect("TMDb HTTP client"),
        }
    }
}

impl TmdbClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn search(
        &self,
        api_key: &str,
        query: &str,
        language: &str,
        use_relay: bool,
    ) -> Result<Vec<BasicInfo>, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }

        let mut last_error = None;
        for base in tmdb_base_urls(use_relay) {
            match self.search_with_base(api_key, query, language, base).await {
                Ok(results) => return Ok(results),
                Err(TmdbError::Network(error)) => last_error = Some(TmdbError::Network(error)),
                Err(error) => return Err(error),
            }
        }
        Err(last_error.unwrap_or(TmdbError::MissingApiKey))
    }

    pub async fn search_media(
        &self,
        api_key: &str,
        query: &str,
        language: &str,
        media_type: &MediaType,
        use_relay: bool,
    ) -> Result<Vec<BasicInfo>, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }

        let media_kind = match media_type {
            MediaType::Movie => "movie",
            MediaType::Series | MediaType::Season => "tv",
        };
        let mut last_error = None;
        for base in tmdb_base_urls(use_relay) {
            match self
                .search_media_with_base(api_key, query, language, media_kind, base)
                .await
            {
                Ok(results) => return Ok(results),
                Err(TmdbError::Network(error)) => last_error = Some(TmdbError::Network(error)),
                Err(error) => return Err(error),
            }
        }
        Err(last_error.unwrap_or(TmdbError::MissingApiKey))
    }

    async fn search_with_base(
        &self,
        api_key: &str,
        query: &str,
        language: &str,
        base: &str,
    ) -> Result<Vec<BasicInfo>, TmdbError> {
        let movie_url = build_search_url_with_base(base, "movie", query, language, 1);
        let series_url = build_search_url_with_base(base, "tv", query, language, 1);
        let movie_request = self
            .http
            .get(movie_url)
            .query(&[("api_key", api_key)])
            .send();
        let series_request = self
            .http
            .get(series_url)
            .query(&[("api_key", api_key)])
            .send();
        let (movie_response, series_response) =
            tokio::try_join!(movie_request, series_request)?;
        let movie_response = movie_response.error_for_status()?;
        let series_response = series_response.error_for_status()?;
        let (movies, series) = tokio::try_join!(
            movie_response.json::<TmdbListResponse<TmdbMovieResult>>(),
            series_response.json::<TmdbListResponse<TmdbSeriesResult>>()
        )?;

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

    async fn search_media_with_base(
        &self,
        api_key: &str,
        query: &str,
        language: &str,
        media_kind: &str,
        base: &str,
    ) -> Result<Vec<BasicInfo>, TmdbError> {
        let url = build_search_url_with_base(base, media_kind, query, language, 1);
        match media_kind {
            "movie" => {
                let movies = self
                    .http
                    .get(url)
                    .query(&[("api_key", api_key)])
                    .send()
                    .await?
                    .error_for_status()?
                    .json::<TmdbListResponse<TmdbMovieResult>>()
                    .await?;
                Ok(movies
                    .results
                    .into_iter()
                    .filter(|movie| movie.genre_ids.contains(&ANIMATION_GENRE_ID))
                    .map(TmdbMovieResult::into_basic_info)
                    .collect())
            }
            _ => {
                let series = self
                    .http
                    .get(url)
                    .query(&[("api_key", api_key)])
                    .send()
                    .await?
                    .error_for_status()?
                    .json::<TmdbListResponse<TmdbSeriesResult>>()
                    .await?;
                Ok(series
                    .results
                    .into_iter()
                    .filter(|series| series.genre_ids.contains(&ANIMATION_GENRE_ID))
                    .map(TmdbSeriesResult::into_basic_info)
                    .collect())
            }
        }
    }

    pub async fn series_detail(
        &self,
        api_key: &str,
        entry_id: &str,
        tmdb_id: i64,
        language: &str,
        use_relay: bool,
    ) -> Result<AnimeDetail, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }

        let mut last_error = None;
        for base in tmdb_base_urls(use_relay) {
            match self
                .series_detail_with_base(api_key, entry_id, tmdb_id, language, base)
                .await
            {
                Ok(detail) => return Ok(detail),
                Err(TmdbError::Network(error)) => last_error = Some(TmdbError::Network(error)),
                Err(error) => return Err(error),
            }
        }
        Err(last_error.unwrap_or(TmdbError::MissingApiKey))
    }

    pub async fn poster_options(
        &self,
        api_key: &str,
        tmdb_id: i64,
        media_type: &MediaType,
        use_relay: bool,
    ) -> Result<Vec<PosterOption>, TmdbError> {
        if api_key.trim().is_empty() {
            return Err(TmdbError::MissingApiKey);
        }
        if tmdb_id <= 0 {
            return Err(TmdbError::NotFound(
                "请先刷新详情，获得有效的 TMDb 条目后再更换海报".into(),
            ));
        }

        let media_kind = match media_type {
            MediaType::Movie => "movie",
            MediaType::Series | MediaType::Season => "tv",
        };
        let mut last_error = None;
        for base in tmdb_base_urls(use_relay) {
            match self
                .poster_options_with_base(api_key, tmdb_id, media_kind, base)
                .await
            {
                Ok(options) => return Ok(options),
                Err(TmdbError::Network(error)) => last_error = Some(TmdbError::Network(error)),
                Err(error) => return Err(error),
            }
        }
        Err(last_error.unwrap_or(TmdbError::MissingApiKey))
    }

    async fn poster_options_with_base(
        &self,
        api_key: &str,
        tmdb_id: i64,
        media_kind: &str,
        base: &str,
    ) -> Result<Vec<PosterOption>, TmdbError> {
        let json = self
            .http
            .get(build_images_url_with_base(base, media_kind, tmdb_id))
            .query(&[("api_key", api_key)])
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        parse_poster_options_json(&json).map_err(TmdbError::Parse)
    }

    async fn series_detail_with_base(
        &self,
        api_key: &str,
        entry_id: &str,
        tmdb_id: i64,
        language: &str,
        base: &str,
    ) -> Result<AnimeDetail, TmdbError> {
        let json = self
            .http
            .get(build_series_detail_url_with_base(base, tmdb_id, language))
            .query(&[("api_key", api_key)])
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let mut detail =
            parse_series_detail_json(entry_id, language, &json).map_err(TmdbError::Parse)?;
        let seasons = detail.seasons.clone();
        let mut episode_offset = 0;
        for season in seasons
            .into_iter()
            .filter(|season| season.episode_count.unwrap_or_default() > 0)
        {
            let season_json = self
                .http
                .get(build_season_url_with_base(
                    base,
                    tmdb_id,
                    season.season_number,
                    language,
                ))
                .query(&[("api_key", api_key)])
                .send()
                .await?
                .error_for_status()?
                .text()
                .await?;
            let offset = if season.season_number > 0 {
                episode_offset
            } else {
                0
            };
            let mut episodes =
                parse_season_episode_json(season.season_number, offset, &season_json)
                    .map_err(TmdbError::Parse)?;
            if season.season_number > 0 {
                episode_offset += episodes.len() as i64;
            }
            detail.episodes.append(&mut episodes);
        }
        Ok(detail)
    }
}

pub fn tmdb_base_urls(use_relay: bool) -> Vec<&'static str> {
    let mut urls = if use_relay {
        vec![TMDB_RELAY_BASE, TMDB_API_ALIAS_BASE, TMDB_API_BASE]
    } else {
        vec![TMDB_API_ALIAS_BASE, TMDB_API_BASE]
    };
    urls.dedup();
    urls
}

pub fn build_search_url(media_kind: &str, query: &str, language: &str, page: u32) -> String {
    build_search_url_with_base(TMDB_API_BASE, media_kind, query, language, page)
}

pub fn build_search_url_with_base(
    base: &str,
    media_kind: &str,
    query: &str,
    language: &str,
    page: u32,
) -> String {
    let base = base.trim_end_matches('/');
    format!(
        "{base}/search/{media_kind}?query={}&language={language}&page={page}&include_adult=false",
        urlencoding::encode(query)
    )
}

pub fn build_detail_url(media_kind: &str, tmdb_id: i64, language: &str) -> String {
    build_detail_url_with_base(TMDB_API_BASE, media_kind, tmdb_id, language)
}

pub fn build_detail_url_with_base(
    base: &str,
    media_kind: &str,
    tmdb_id: i64,
    language: &str,
) -> String {
    let base = base.trim_end_matches('/');
    format!("{base}/{media_kind}/{tmdb_id}?language={language}")
}

pub fn build_series_detail_url_with_base(base: &str, tmdb_id: i64, language: &str) -> String {
    let base = base.trim_end_matches('/');
    format!("{base}/tv/{tmdb_id}?language={language}&append_to_response=aggregate_credits")
}

pub fn build_images_url_with_base(base: &str, media_kind: &str, tmdb_id: i64) -> String {
    let base = base.trim_end_matches('/');
    format!("{base}/{media_kind}/{tmdb_id}/images?include_image_language=zh,en,ja,null")
}

pub fn build_season_url_with_base(
    base: &str,
    tmdb_id: i64,
    season_number: i64,
    language: &str,
) -> String {
    let base = base.trim_end_matches('/');
    format!("{base}/tv/{tmdb_id}/season/{season_number}?language={language}")
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
        runtime_minutes: detail
            .episode_run_time
            .and_then(|items| items.first().copied()),
        episode_count: detail.number_of_episodes,
        season_count: detail.number_of_seasons,
        characters: detail
            .aggregate_credits
            .as_ref()
            .map(|credits| make_characters(&credits.cast))
            .unwrap_or_default(),
        staff: detail
            .aggregate_credits
            .as_ref()
            .map(|credits| make_staff(&credits.crew))
            .unwrap_or_default(),
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

pub fn parse_season_episode_json(
    season_number: i64,
    episode_offset: i64,
    json: &str,
) -> Result<Vec<EpisodeSummary>, serde_json::Error> {
    let season: TmdbSeasonDetail = serde_json::from_str(json)?;
    Ok(season
        .episodes
        .unwrap_or_default()
        .into_iter()
        .map(|episode| EpisodeSummary {
            id: episode.id,
            season_number: Some(season_number),
            episode_number: episode_offset + episode.episode_number,
            title: episode.name,
            air_date: episode.air_date.filter(|value| !value.is_empty()),
            image_url: image_url(episode.still_path),
            overview: episode.overview.filter(|value| !value.is_empty()),
        })
        .collect())
}

pub fn parse_poster_options_json(json: &str) -> Result<Vec<PosterOption>, serde_json::Error> {
    let response: TmdbImagesResponse = serde_json::from_str(json)?;
    let mut options = response
        .posters
        .into_iter()
        .filter(|poster| poster.file_path.trim().starts_with('/'))
        .map(|poster| {
            let id = poster.file_path.trim_start_matches('/').to_string();
            PosterOption {
                id,
                url: image_url_from_path(TMDB_IMAGE_BASE, &poster.file_path),
                preview_url: image_url_from_path(TMDB_POSTER_PREVIEW_BASE, &poster.file_path),
                source: "TMDb".into(),
                width: poster.width,
                height: poster.height,
                vote_average: poster.vote_average,
                language: poster.iso_639_1.filter(|value| !value.is_empty()),
            }
        })
        .collect::<Vec<_>>();

    options.sort_by(|left, right| {
        right
            .vote_average
            .unwrap_or_default()
            .partial_cmp(&left.vote_average.unwrap_or_default())
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                right
                    .width
                    .unwrap_or_default()
                    .cmp(&left.width.unwrap_or_default())
            })
    });
    options.truncate(40);
    Ok(options)
}

#[derive(Debug, Deserialize)]
struct TmdbListResponse<T> {
    results: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct TmdbMovieResult {
    id: i64,
    #[serde(default)]
    title: String,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    release_date: Option<String>,
    #[serde(default)]
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
    #[serde(default)]
    name: String,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    first_air_date: Option<String>,
    #[serde(default)]
    genre_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct TmdbSeriesDetail {
    #[serde(default)]
    name: String,
    tagline: Option<String>,
    overview: Option<String>,
    status: Option<String>,
    first_air_date: Option<String>,
    vote_average: Option<f64>,
    episode_run_time: Option<Vec<i64>>,
    number_of_episodes: Option<i64>,
    number_of_seasons: Option<i64>,
    aggregate_credits: Option<TmdbAggregateCredits>,
    seasons: Option<Vec<TmdbSeasonSummary>>,
}

#[derive(Debug, Deserialize)]
struct TmdbSeasonSummary {
    id: i64,
    season_number: i64,
    #[serde(default)]
    name: String,
    poster_path: Option<String>,
    episode_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateCredits {
    #[serde(default)]
    cast: Vec<TmdbAggregateCastMember>,
    #[serde(default)]
    crew: Vec<TmdbAggregateCrewMember>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateCastMember {
    id: i64,
    #[serde(default)]
    name: String,
    profile_path: Option<String>,
    #[serde(default)]
    roles: Vec<TmdbAggregateRole>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateRole {
    character: Option<String>,
    episode_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateCrewMember {
    id: i64,
    name: String,
    known_for_department: Option<String>,
    profile_path: Option<String>,
    #[serde(default)]
    jobs: Vec<TmdbAggregateJob>,
}

#[derive(Debug, Deserialize)]
struct TmdbAggregateJob {
    #[serde(default)]
    credit_id: String,
    #[serde(default)]
    job: String,
    #[serde(default)]
    episode_count: i64,
}

#[derive(Debug, Deserialize)]
struct TmdbSeasonDetail {
    episodes: Option<Vec<TmdbEpisode>>,
}

#[derive(Debug, Deserialize)]
struct TmdbEpisode {
    id: i64,
    episode_number: i64,
    #[serde(default)]
    name: String,
    air_date: Option<String>,
    still_path: Option<String>,
    overview: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbImagesResponse {
    #[serde(default)]
    posters: Vec<TmdbImage>,
}

#[derive(Debug, Deserialize)]
struct TmdbImage {
    #[serde(default)]
    file_path: String,
    width: Option<i64>,
    height: Option<i64>,
    vote_average: Option<f64>,
    iso_639_1: Option<String>,
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
    path.map(|path| image_url_from_path(TMDB_IMAGE_BASE, &path))
}

fn profile_url(path: Option<String>) -> Option<String> {
    path.map(|path| image_url_from_path(TMDB_PROFILE_BASE, &path))
}

fn image_url_from_path(base: &str, path: &str) -> String {
    format!("{base}{path}")
}

fn reqwest_error_message(error: reqwest::Error) -> String {
    let sanitized = error.without_url();
    let mut parts = vec![sanitized.to_string()];
    let mut source = sanitized.source();
    while let Some(error) = source {
        let message = error.to_string();
        if !parts.iter().any(|part| part == &message) {
            parts.push(message);
        }
        source = error.source();
    }
    parts.join(": ")
}

fn make_characters(cast: &[TmdbAggregateCastMember]) -> Vec<CharacterSummary> {
    cast.iter()
        .take(12)
        .map(|member| {
            let character_name = member
                .roles
                .iter()
                .max_by_key(|role| role.episode_count.unwrap_or_default())
                .and_then(|role| role.character.as_deref())
                .map(strip_voice_qualifier)
                .filter(|name| !name.is_empty())
                .unwrap_or("Character")
                .to_string();
            CharacterSummary {
                id: member.id,
                character_name,
                actor_name: member.name.clone(),
                profile_url: profile_url(member.profile_path.clone()),
            }
        })
        .collect()
}

fn make_staff(crew: &[TmdbAggregateCrewMember]) -> Vec<StaffSummary> {
    crew.iter()
        .take(12)
        .map(|member| {
            let role = member
                .known_for_department
                .clone()
                .filter(|value| !value.is_empty())
                .or_else(|| member.jobs.first().map(|job| job.job.clone()))
                .unwrap_or_else(|| "Staff".into());
            StaffSummary {
                id: member.id,
                name: member.name.clone(),
                role,
                department: member
                    .known_for_department
                    .clone()
                    .filter(|value| !value.is_empty()),
                profile_url: profile_url(member.profile_path.clone()),
                jobs: member
                    .jobs
                    .iter()
                    .map(|job| StaffJobSummary {
                        credit_id: job.credit_id.clone(),
                        job: job.job.clone(),
                        episode_count: job.episode_count,
                    })
                    .collect(),
            }
        })
        .collect()
}

fn strip_voice_qualifier(value: &str) -> &str {
    value
        .trim()
        .strip_suffix(" (voice)")
        .or_else(|| value.trim().strip_suffix("(voice)"))
        .unwrap_or_else(|| value.trim())
        .trim()
}
