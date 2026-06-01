import type { AnimeEntry, LibraryFilters, LibrarySort } from "./types";

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

function compareNullableDates(left?: string | null, right?: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return leftTime - rightTime;
}
