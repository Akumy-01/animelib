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

export interface AppState {
  entries: AnimeEntry[];
  hasApiKey: boolean;
}
