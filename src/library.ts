import type { AnimeEntry, LibraryFilters, LibrarySort, LibraryStats, WatchStatus } from "./types";

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

export function updateEntryInList(entries: AnimeEntry[], updated: AnimeEntry): AnimeEntry[] {
  return entries.map((entry) => (entry.id === updated.id ? updated : entry));
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

function countStatus(entries: AnimeEntry[], status: WatchStatus): number {
  return entries.filter((entry) => entry.watchStatus === status).length;
}

function compareNullableDates(left?: string | null, right?: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return leftTime - rightTime;
}
