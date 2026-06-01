import { describe, expect, it } from "vitest";
import {
  chunkBatchPrompts,
  deriveLibraryStats,
  filterEntries,
  parseBatchPrompts,
  parseBackupState,
  sortEntries,
  updateEntryInList,
} from "./library";

describe("sortEntries", () => {
  it("sorts entries by saved date descending by default", () => {
    const result = sortEntries([
      { id: "1", name: "Old", dateSaved: "2026-01-01T00:00:00Z" },
      { id: "2", name: "New", dateSaved: "2026-02-01T00:00:00Z" },
    ] as any);

    expect(result.map((entry) => entry.name)).toEqual(["New", "Old"]);
  });
});

describe("filterEntries", () => {
  it("filters by watch status and favorite", () => {
    const entries = [
      { id: "1", watchStatus: "watching", favorite: true, name: "A" },
      { id: "2", watchStatus: "watched", favorite: false, name: "B" },
    ] as any;

    expect(filterEntries(entries, { status: "watching", favoriteOnly: true })).toHaveLength(1);
  });
});

describe("updateEntryInList", () => {
  it("replaces one entry without changing others", () => {
    const entries = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ] as any;
    const updated = updateEntryInList(entries, { id: "2", name: "C" } as any);

    expect(updated.map((entry) => entry.name)).toEqual(["A", "C"]);
  });
});

describe("deriveLibraryStats", () => {
  it("counts statuses, favorites, and average score", () => {
    const stats = deriveLibraryStats([
      { id: "1", watchStatus: "watching", favorite: true, score: 5 },
      { id: "2", watchStatus: "watched", favorite: false, score: 3 },
      { id: "3", watchStatus: "watching", favorite: true, score: null },
    ] as any);

    expect(stats.total).toBe(3);
    expect(stats.watching).toBe(2);
    expect(stats.favorites).toBe(2);
    expect(stats.averageScore).toBe(4);
  });
});

describe("parseBatchPrompts", () => {
  it("trims lines, removes empty rows, and preserves order", () => {
    expect(parseBatchPrompts(" Frieren \\n\\nAkira\\n  Demon Slayer  ")).toEqual([
      "Frieren",
      "Akira",
      "Demon Slayer",
    ]);
  });
});

describe("chunkBatchPrompts", () => {
  it("chunks prompts by a positive chunk size", () => {
    expect(chunkBatchPrompts(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });
});

describe("parseBackupState", () => {
  it("parses an AniShelf export payload into app state entries", () => {
    const state = parseBackupState(
      JSON.stringify({
        entries: [{ id: "movie-1", name: "Restored", watchStatus: "watched" }],
        preferences: {
          libraryViewStyle: "list",
          sort: "title",
          sortReversed: false,
          scoringEnabled: true,
          preferredLanguage: "zh-CN",
          theme: "warm",
        },
      }),
    );

    expect(state.entries[0].name).toBe("Restored");
    expect(state.preferences.libraryViewStyle).toBe("list");
  });
});
