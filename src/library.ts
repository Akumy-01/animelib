import type {
  AnimeEntry,
  AppPreferences,
  EpisodeProgress,
  EpisodeSummary,
  EpisodeWithProgress,
  AppState,
  LibraryFilters,
  LibrarySort,
  LibraryStats,
  WatchStatus,
} from "./types";

export const defaultAppPreferences: AppPreferences = {
  libraryViewStyle: "gallery",
  sort: "dateSaved",
  sortReversed: false,
  scoringEnabled: true,
  preferredLanguage: "zh-CN",
  theme: "warm",
  followSystemLanguage: false,
  hideDroppedByDefault: false,
  defaultNewEntryWatchStatus: "planToWatch",
  defaultStatusFilter: "all",
  defaultFavoriteOnly: false,
  openDetailWithSingleTap: false,
  entryDetailCharactersExpandedByDefault: true,
  entryDetailStaffExpandedByDefault: false,
  episodeProgressTrackingEnabled: false,
  posterProgressBarOverlayEnabled: true,
  autoPrefetchImagesOnAddAndRestore: false,
  useTmdbRelayServer: false,
};

export function sortEntries(
  entries: AnimeEntry[],
  sort: LibrarySort = "dateSaved",
  reversed = false,
): AnimeEntry[] {
  const sorted = [...entries].sort((left, right) => {
    if (sort === "title") {
      return left.name.localeCompare(right.name);
    }
    if (sort === "releaseDate") {
      return compareNullableDates(left.onAirDate, right.onAirDate);
    }
    if (sort === "score") {
      return (right.score ?? -1) - (left.score ?? -1);
    }
    return compareNullableDates(right.dateSaved, left.dateSaved);
  });

  return reversed ? sorted.reverse() : sorted;
}

export function filterEntries(entries: AnimeEntry[], filters: LibraryFilters): AnimeEntry[] {
  const query = filters.query?.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filters.hideDropped && (filters.status ?? "all") === "all" && entry.watchStatus === "dropped") {
      return false;
    }
    if (filters.status && filters.status !== "all" && entry.watchStatus !== filters.status) {
      return false;
    }
    if (filters.favoriteOnly && !entry.favorite) {
      return false;
    }
    if (query && !entry.name.toLocaleLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

export function filtersFromPreferences(preferences: AppPreferences): LibraryFilters {
  return {
    status: preferences.defaultStatusFilter,
    favoriteOnly: preferences.defaultFavoriteOnly,
    hideDropped: preferences.hideDroppedByDefault,
  };
}

export function updateQueryFilter(filters: LibraryFilters, query: string): LibraryFilters {
  const trimmed = query.trim();
  return {
    ...filters,
    query: trimmed.length > 0 ? trimmed : undefined,
  };
}

export function updateEntryInList(entries: AnimeEntry[], updated: AnimeEntry): AnimeEntry[] {
  return entries.map((entry) => (entry.id === updated.id ? updated : entry));
}

export function shouldRenderRemoteImage(url: string | null | undefined, failed: boolean): boolean {
  return !failed && Boolean(url?.trim());
}

export function applyEntryDefaults(entry: AnimeEntry, preferences: AppPreferences): AnimeEntry {
  return {
    ...entry,
    watchStatus: preferences.defaultNewEntryWatchStatus,
    score: preferences.scoringEnabled ? entry.score ?? null : null,
  };
}

export function applyCustomPosterUrl(entry: AnimeEntry, posterUrl: string): AnimeEntry {
  return {
    ...entry,
    posterUrl,
    usingCustomPoster: true,
  };
}

export function clearCustomPoster(entry: AnimeEntry, originalPosterUrl: string | null | undefined): AnimeEntry {
  return {
    ...entry,
    posterUrl: originalPosterUrl ?? null,
    usingCustomPoster: false,
  };
}

export function applyTmdbPosterUrl(entry: AnimeEntry, posterUrl: string): AnimeEntry {
  return {
    ...entry,
    posterUrl: tmdbOriginalImageUrl(posterUrl) ?? posterUrl,
    usingCustomPoster: false,
  };
}

export function tmdbOriginalImageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(
    /^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//,
    "https://image.tmdb.org/t/p/original/",
  );
}

export function applyWatchStatus(entry: AnimeEntry, watchStatus: WatchStatus): AnimeEntry {
  return {
    ...entry,
    watchStatus,
    score: watchStatus === "watched" ? entry.score ?? null : null,
  };
}

export function compactGridCardState(
  entry: Pick<AnimeEntry, "watchStatus" | "favorite">,
): { showActivityDot: boolean; showHeartBadge: boolean } {
  return {
    showActivityDot: entry.watchStatus === "watched",
    showHeartBadge: entry.favorite,
  };
}

export function tmdbPosterCacheKey(
  entry: Pick<AnimeEntry, "mediaType" | "tmdbId" | "seasonNumber">,
): string | null {
  if (entry.tmdbId <= 0) {
    return null;
  }
  return `${entry.mediaType}:${entry.tmdbId}:${entry.seasonNumber ?? "main"}`;
}

export function toastAutoDismissDelay(message: string | null | undefined): number | null {
  return message?.trim() ? 3200 : null;
}

export function deriveLibraryStats(entries: AnimeEntry[]): LibraryStats {
  const scored = entries
    .map((entry) => entry.score)
    .filter((score): score is number => typeof score === "number");
  const averageScore =
    scored.length === 0 ? null : scored.reduce((sum, score) => sum + score, 0) / scored.length;

  return {
    total: entries.length,
    planToWatch: countStatus(entries, "planToWatch"),
    watching: countStatus(entries, "watching"),
    watched: countStatus(entries, "watched"),
    dropped: countStatus(entries, "dropped"),
    favorites: entries.filter((entry) => entry.favorite).length,
    averageScore,
  };
}

export function watchStatusLabel(status: WatchStatus): string {
  switch (status) {
    case "watching":
      return "在看";
    case "watched":
      return "已看完";
    case "dropped":
      return "已放弃";
    case "planToWatch":
      return "想看";
  }
}

export function mediaTypeLabel(mediaType: AnimeEntry["mediaType"]): string {
  switch (mediaType) {
    case "movie":
      return "电影";
    case "series":
      return "剧集";
    case "season":
      return "季";
  }
}

export function parseBatchPrompts(input: string): string[] {
  return input
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function chunkBatchPrompts(prompts: string[], chunkSize = 8): string[][] {
  const normalizedChunkSize = Math.max(1, chunkSize);
  const chunks: string[][] = [];
  for (let index = 0; index < prompts.length; index += normalizedChunkSize) {
    chunks.push(prompts.slice(index, index + normalizedChunkSize));
  }
  return chunks;
}

export function parseBackupState(json: string): AppState {
  const payload = JSON.parse(json) as unknown;

  if (isIosLibraryExportPayload(payload)) {
    return {
      entries: payload.entries.map(iosExportRecordToEntry),
      preferences: defaultAppPreferences,
      hasApiKey: false,
    };
  }

  if (!isRecord(payload)) {
    throw new Error("Backup is not a valid animelib payload.");
  }

  if (!Array.isArray(payload.entries)) {
    throw new Error("Backup does not contain entries.");
  }
  if (!payload.preferences) {
    throw new Error("Backup does not contain preferences.");
  }
  return {
    entries: payload.entries as AnimeEntry[],
    preferences: normalizePreferences(payload.preferences as Partial<AppPreferences>),
    hasApiKey: false,
  };
}

export function normalizePreferences(preferences: Partial<AppPreferences> | undefined): AppPreferences {
  return {
    ...defaultAppPreferences,
    ...preferences,
  };
}

export function isSupportedLibraryImportFile(fileName: string): boolean {
  const normalized = fileName.trim().toLocaleLowerCase();
  return normalized.endsWith(".json") || normalized.endsWith(".anishelf");
}

type IosLibraryExportPayload = {
  app?: string;
  entries: IosLibraryExportRecord[];
};

type IosLibraryExportRecord = {
  title: string;
  animeType: string;
  seasonNumber?: number | null;
  detailsURL?: string | null;
  detailsUrl?: string | null;
  releaseDate?: string | null;
  dateSaved?: string | null;
  watchStatus?: string | null;
  dateStarted?: string | null;
  dateFinished?: string | null;
  score?: number | null;
  favorite?: boolean | null;
  notes?: string | null;
  usingCustomPoster?: boolean | null;
};

function isIosLibraryExportPayload(payload: unknown): payload is IosLibraryExportPayload {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) {
    return false;
  }
  if (payload.app !== "AniShelf") {
    return false;
  }
  return payload.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.title === "string" &&
      typeof entry.animeType === "string" &&
      !("id" in entry),
  );
}

function iosExportRecordToEntry(record: IosLibraryExportRecord, index: number): AnimeEntry {
  const mediaType = mediaTypeFromIosExport(record.animeType);
  const detailsUrl = record.detailsURL ?? record.detailsUrl ?? null;
  const tmdbId = tmdbIdFromDetailsUrl(detailsUrl) ?? fallbackTmdbId(record.title, index);
  const seasonNumber = typeof record.seasonNumber === "number" ? record.seasonNumber : null;

  return {
    id: entryIdFromParts(mediaType, tmdbId, seasonNumber),
    tmdbId,
    mediaType,
    seasonNumber,
    parentSeriesId: null,
    name: record.title,
    overview: null,
    posterUrl: null,
    backdropUrl: null,
    detailsUrl,
    originalLanguageCode: null,
    onAirDate: record.releaseDate ?? null,
    watchStatus: watchStatusFromIosExport(record.watchStatus),
    dateSaved: record.dateSaved || "1970-01-01T00:00:00Z",
    dateStarted: record.dateStarted ?? null,
    dateFinished: record.dateFinished ?? null,
    isDateTrackingEnabled: true,
    score: record.score ?? null,
    favorite: Boolean(record.favorite),
    notes: record.notes ?? "",
    usingCustomPoster: Boolean(record.usingCustomPoster),
  };
}

function mediaTypeFromIosExport(value: string): AnimeEntry["mediaType"] {
  if (value === "series" || value === "season") {
    return value;
  }
  return "movie";
}

function watchStatusFromIosExport(value: string | null | undefined): WatchStatus {
  if (value === "watching" || value === "watched" || value === "dropped") {
    return value;
  }
  return "planToWatch";
}

function tmdbIdFromDetailsUrl(detailsUrl: string | null | undefined): number | null {
  const match = detailsUrl?.match(/\/(?:movie|tv)\/(\d+)/);
  if (!match) {
    return null;
  }
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

function fallbackTmdbId(title: string, index: number): number {
  let hash = 0;
  for (const character of title) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9_000_000;
  }
  return -(hash + index + 1);
}

function entryIdFromParts(
  mediaType: AnimeEntry["mediaType"],
  tmdbId: number,
  seasonNumber: number | null,
): string {
  if (mediaType === "season") {
    return `season-${tmdbId}-${seasonNumber ?? 0}`;
  }
  return `${mediaType}-${tmdbId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function combineEpisodesWithProgress(
  episodes: EpisodeSummary[],
  progress: EpisodeProgress[],
): EpisodeWithProgress[] {
  const watchedEpisodes = new Set(
    progress.filter((item) => item.watched).map((item) => item.episodeNumber),
  );
  return episodes.map((episode) => ({
    ...episode,
    watched: watchedEpisodes.has(episode.episodeNumber),
  }));
}

export type KeyboardShortcutAction =
  | "search"
  | "settings"
  | "export"
  | "refreshDetail"
  | "viewGallery"
  | "viewList"
  | "viewGrid"
  | "closeSheet";

export function keyboardShortcutAction(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey">,
): KeyboardShortcutAction | null {
  const key = event.key.toLocaleLowerCase();
  const command = event.ctrlKey || event.metaKey;

  if (command && key === "k") {
    return "search";
  }
  if (command && event.key === ",") {
    return "settings";
  }
  if (command && key === "e") {
    return "export";
  }
  if (command && key === "r") {
    return "refreshDetail";
  }
  if (command && event.key === "1") {
    return "viewGallery";
  }
  if (command && event.key === "2") {
    return "viewList";
  }
  if (command && event.key === "3") {
    return "viewGrid";
  }
  if (event.key === "Escape") {
    return "closeSheet";
  }
  return null;
}

export function buildPreferences(
  current: AppPreferences,
  updates: Pick<AppPreferences, "libraryViewStyle" | "sort" | "sortReversed">,
): AppPreferences {
  return {
    ...current,
    ...updates,
  };
}

function countStatus(entries: AnimeEntry[], status: WatchStatus): number {
  return entries.filter((entry) => entry.watchStatus === status).length;
}

function compareNullableDates(left?: string | null, right?: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return leftTime - rightTime;
}
