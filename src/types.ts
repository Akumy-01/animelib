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
}

export interface AppPreferences {
  libraryViewStyle: LibraryViewStyle;
  sort: LibrarySort;
  sortReversed: boolean;
  scoringEnabled: boolean;
  preferredLanguage: string;
  theme: string;
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
  seasons: SeasonSummary[];
  episodes: EpisodeSummary[];
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

export type EpisodeWithProgress = EpisodeSummary & { watched: boolean };
