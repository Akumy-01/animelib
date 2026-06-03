export type MediaType = "movie" | "series" | "season";

export type WatchStatus = "planToWatch" | "watching" | "watched" | "dropped";

export type LibraryViewStyle = "gallery" | "list" | "grid";

export type LibrarySort = "dateSaved" | "title" | "releaseDate" | "score";

export interface AnimeEntry {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  seasonNumber?: number | null;
  parentSeriesId?: number | null;
  name: string;
  overview?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  detailsUrl?: string | null;
  originalLanguageCode?: string | null;
  onAirDate?: string | null;
  watchStatus: WatchStatus;
  dateSaved: string;
  dateStarted?: string | null;
  dateFinished?: string | null;
  isDateTrackingEnabled: boolean;
  score?: number | null;
  favorite: boolean;
  notes: string;
  usingCustomPoster: boolean;
}

export interface BasicInfo {
  tmdbId: number;
  mediaType: MediaType;
  seasonNumber?: number | null;
  parentSeriesId?: number | null;
  name: string;
  overview?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onAirDate?: string | null;
}

export interface LibraryFilters {
  status?: WatchStatus | "all";
  favoriteOnly?: boolean;
  query?: string;
  hideDropped?: boolean;
}

export interface AppPreferences {
  libraryViewStyle: LibraryViewStyle;
  sort: LibrarySort;
  sortReversed: boolean;
  scoringEnabled: boolean;
  preferredLanguage: string;
  theme: string;
  followSystemLanguage: boolean;
  hideDroppedByDefault: boolean;
  defaultNewEntryWatchStatus: WatchStatus;
  defaultStatusFilter: WatchStatus | "all";
  defaultFavoriteOnly: boolean;
  openDetailWithSingleTap: boolean;
  entryDetailCharactersExpandedByDefault: boolean;
  entryDetailStaffExpandedByDefault: boolean;
  episodeProgressTrackingEnabled: boolean;
  posterProgressBarOverlayEnabled: boolean;
  autoPrefetchImagesOnAddAndRestore: boolean;
  useTmdbRelayServer: boolean;
}

export interface AppState {
  entries: AnimeEntry[];
  preferences: AppPreferences;
  hasApiKey: boolean;
}

export interface LibraryStats {
  total: number;
  planToWatch: number;
  watching: number;
  watched: number;
  dropped: number;
  favorites: number;
  averageScore: number | null;
}

export interface AnimeDetail {
  entryId: string;
  language: string;
  title: string;
  subtitle?: string | null;
  overview?: string | null;
  status?: string | null;
  airDate?: string | null;
  voteAverage?: number | null;
  runtimeMinutes?: number | null;
  episodeCount?: number | null;
  seasonCount?: number | null;
  characters: CharacterSummary[];
  staff: StaffSummary[];
  seasons: SeasonSummary[];
  episodes: EpisodeSummary[];
}

export interface RefreshDetailResult {
  entry: AnimeEntry;
  detail: AnimeDetail;
}

export interface CharacterSummary {
  id: number;
  characterName: string;
  actorName: string;
  profileUrl?: string | null;
}

export interface StaffSummary {
  id: number;
  name: string;
  role: string;
  department?: string | null;
  profileUrl?: string | null;
  jobs: StaffJobSummary[];
}

export interface StaffJobSummary {
  creditId: string;
  job: string;
  episodeCount: number;
}

export interface SeasonSummary {
  id: number;
  seasonNumber: number;
  title: string;
  posterUrl?: string | null;
  episodeCount?: number | null;
}

export interface EpisodeSummary {
  id: number;
  seasonNumber?: number | null;
  episodeNumber: number;
  title: string;
  airDate?: string | null;
  imageUrl?: string | null;
  overview?: string | null;
}

export interface EpisodeProgress {
  entryId: string;
  episodeNumber: number;
  watched: boolean;
  watchedAt?: string | null;
}

export interface PosterOption {
  id: string;
  url: string;
  previewUrl: string;
  source: string;
  width?: number | null;
  height?: number | null;
  voteAverage?: number | null;
  language?: string | null;
}

export type EpisodeWithProgress = EpisodeSummary & { watched: boolean };
