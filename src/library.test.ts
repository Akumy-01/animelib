import { describe, expect, it } from "vitest";
import {
  buildPreferences,
  chunkBatchPrompts,
  combineEpisodesWithProgress,
  deriveLibraryStats,
  keyboardShortcutAction,
  filterEntries,
  parseBatchPrompts,
  parseBackupState,
  shouldRenderRemoteImage,
  sortEntries,
  updateQueryFilter,
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

describe("updateQueryFilter", () => {
  it("stores trimmed query text and clears empty queries", () => {
    expect(updateQueryFilter({ status: "all" }, "  frieren  ")).toEqual({
      status: "all",
      query: "frieren",
    });
    expect(updateQueryFilter({ status: "all", query: "frieren" }, "   ")).toEqual({
      status: "all",
      query: undefined,
    });
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

describe("shouldRenderRemoteImage", () => {
  it("uses fallback artwork when a remote image is missing or failed", () => {
    expect(shouldRenderRemoteImage("https://image.tmdb.org/poster.jpg", false)).toBe(true);
    expect(shouldRenderRemoteImage("https://image.tmdb.org/poster.jpg", true)).toBe(false);
    expect(shouldRenderRemoteImage(null, false)).toBe(false);
    expect(shouldRenderRemoteImage("   ", false)).toBe(false);
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

describe("combineEpisodesWithProgress", () => {
  it("marks episodes as watched using progress records", () => {
    const episodes = [
      { id: 1, episodeNumber: 1, title: "One" },
      { id: 2, episodeNumber: 2, title: "Two" },
    ] as any;
    const progress = [{ entryId: "series-1", episodeNumber: 2, watched: true }] as any;

    expect(combineEpisodesWithProgress(episodes, progress)).toEqual([
      { id: 1, episodeNumber: 1, title: "One", watched: false },
      { id: 2, episodeNumber: 2, title: "Two", watched: true },
    ]);
  });
});

describe("keyboardShortcutAction", () => {
  it("maps desktop shortcuts to app actions", () => {
    expect(keyboardShortcutAction({ key: "k", ctrlKey: true } as KeyboardEvent)).toBe("search");
    expect(keyboardShortcutAction({ key: ",", ctrlKey: true } as KeyboardEvent)).toBe("settings");
    expect(keyboardShortcutAction({ key: "e", ctrlKey: true } as KeyboardEvent)).toBe("export");
    expect(keyboardShortcutAction({ key: "r", ctrlKey: true } as KeyboardEvent)).toBe("refreshDetail");
    expect(keyboardShortcutAction({ key: "1", ctrlKey: true } as KeyboardEvent)).toBe("viewGallery");
    expect(keyboardShortcutAction({ key: "2", ctrlKey: true } as KeyboardEvent)).toBe("viewList");
    expect(keyboardShortcutAction({ key: "3", ctrlKey: true } as KeyboardEvent)).toBe("viewGrid");
    expect(keyboardShortcutAction({ key: "Escape", ctrlKey: false } as KeyboardEvent)).toBe("closeSheet");
  });
});

describe("buildPreferences", () => {
  it("updates library controls without losing existing preference fields", () => {
    const preferences = buildPreferences(
      {
        libraryViewStyle: "gallery",
        sort: "dateSaved",
        sortReversed: false,
        scoringEnabled: false,
        preferredLanguage: "ja-JP",
        theme: "warm",
      },
      {
        libraryViewStyle: "list",
        sort: "title",
        sortReversed: true,
      },
    );

    expect(preferences).toEqual({
      libraryViewStyle: "list",
      sort: "title",
      sortReversed: true,
      scoringEnabled: false,
      preferredLanguage: "ja-JP",
      theme: "warm",
    });
  });
});
