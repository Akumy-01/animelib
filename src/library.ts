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
      return "Watching";
    case "watched":
      return "Watched";
    case "dropped":
      return "Dropped";
    case "planToWatch":
      return "Planned";
  }
}

export function mediaTypeLabel(mediaType: AnimeEntry["mediaType"]): string {
  switch (mediaType) {
    case "movie":
      return "Movie";
    case "series":
      return "Series";
    case "season":
      return "Season";
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
  const payload = JSON.parse(json) as {
    entries?: AnimeEntry[];
    preferences?: AppPreferences;
  };
  if (!Array.isArray(payload.entries)) {
    throw new Error("Backup does not contain entries.");
  }
  if (!payload.preferences) {
    throw new Error("Backup does not contain preferences.");
  }
  return {
    entries: payload.entries,
    preferences: payload.preferences,
    hasApiKey: false,
  };
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
