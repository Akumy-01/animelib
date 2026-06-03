import { describe, expect, it } from "vitest";
import {
  applyEntryDefaults,
  applyCustomPosterUrl,
  applyTmdbPosterUrl,
  applyWatchStatus,
  buildPreferences,
  clearCustomPoster,
  chunkBatchPrompts,
  compactGridCardState,
  combineEpisodesWithProgress,
  defaultAppPreferences,
  deriveLibraryStats,
  keyboardShortcutAction,
  filtersFromPreferences,
  filterEntries,
  isSupportedLibraryImportFile,
  parseBatchPrompts,
  parseBackupState,
  shouldRenderRemoteImage,
  sortEntries,
  tmdbOriginalImageUrl,
  tmdbPosterCacheKey,
  toastAutoDismissDelay,
  updateQueryFilter,
  updateEntryInList,
  watchStatusLabel,
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

  it("hides dropped entries by default unless dropped is explicitly selected", () => {
    const entries = [
      { id: "1", watchStatus: "watching", favorite: false, name: "A" },
      { id: "2", watchStatus: "dropped", favorite: false, name: "B" },
    ] as any;

    expect(filterEntries(entries, { status: "all", hideDropped: true }).map((entry) => entry.id)).toEqual(["1"]);
    expect(filterEntries(entries, { status: "dropped", hideDropped: true }).map((entry) => entry.id)).toEqual(["2"]);
  });
});

describe("filtersFromPreferences", () => {
  it("builds startup filters from saved library defaults", () => {
    expect(
      filtersFromPreferences({
        ...defaultAppPreferences,
        defaultStatusFilter: "watching",
        defaultFavoriteOnly: true,
        hideDroppedByDefault: true,
      }),
    ).toEqual({
      status: "watching",
      favoriteOnly: true,
      hideDropped: true,
    });
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
    expect(stats.planToWatch).toBe(0);
    expect(stats.watching).toBe(2);
    expect(stats.watched).toBe(1);
    expect(stats.favorites).toBe(2);
    expect(stats.averageScore).toBe(4);
  });
});

describe("watchStatusLabel", () => {
  it("uses the simplified Chinese status names", () => {
    expect(watchStatusLabel("planToWatch")).toBe("想看");
    expect(watchStatusLabel("watching")).toBe("在看");
    expect(watchStatusLabel("watched")).toBe("已看完");
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
  it("parses an animelib export payload into app state entries", () => {
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

  it("fills newer preference defaults when importing an older export", () => {
    const state = parseBackupState(
      JSON.stringify({
        entries: [],
        preferences: {
          libraryViewStyle: "gallery",
          sort: "dateSaved",
          sortReversed: false,
          scoringEnabled: true,
          preferredLanguage: "zh-CN",
          theme: "warm",
        },
      }),
    );

    expect(state.preferences.defaultNewEntryWatchStatus).toBe("planToWatch");
    expect(state.preferences.defaultStatusFilter).toBe("all");
    expect(state.preferences.episodeProgressTrackingEnabled).toBe(false);
  });

  it("imports original iOS AniShelf library JSON exports", () => {
    const state = parseBackupState(
      JSON.stringify({
        app: "AniShelf",
        formatVersion: 1,
        exportedAt: "2026-05-30T10:00:00Z",
        entryCount: 1,
        entries: [
          {
            title: "Frieren: Beyond Journey's End",
            parentSeriesTitle: null,
            releaseYear: 2023,
            releaseDate: "2023-09-29",
            animeType: "series",
            seasonNumber: null,
            detailsURL: "https://www.themoviedb.org/tv/154521",
            dateSaved: "2026-02-03T10:00:00Z",
            watchStatus: "planned",
            dateStarted: null,
            dateFinished: null,
            score: 5,
            favorite: true,
            notes: "Imported from iOS",
            usingCustomPoster: false,
          },
        ],
      }),
    );

    expect(state.entries[0]).toMatchObject({
      id: "series-154521",
      tmdbId: 154521,
      mediaType: "series",
      name: "Frieren: Beyond Journey's End",
      onAirDate: "2023-09-29",
      watchStatus: "planToWatch",
      favorite: true,
      notes: "Imported from iOS",
    });
    expect(state.preferences).toEqual(defaultAppPreferences);
  });
});

describe("isSupportedLibraryImportFile", () => {
  it("allows AniShelf JSON import files", () => {
    expect(isSupportedLibraryImportFile("library.json")).toBe(true);
    expect(isSupportedLibraryImportFile("library.anishelf")).toBe(true);
    expect(isSupportedLibraryImportFile("library.mallib")).toBe(false);
  });
});

describe("applyEntryDefaults", () => {
  it("applies saved defaults to newly added entries", () => {
    const entry = applyEntryDefaults(
      { id: "1", watchStatus: "planToWatch", score: 3 } as any,
      {
        ...defaultAppPreferences,
        defaultNewEntryWatchStatus: "watching",
        scoringEnabled: false,
      },
    );

    expect(entry.watchStatus).toBe("watching");
    expect(entry.score).toBeNull();
  });
});

describe("custom poster helpers", () => {
  it("marks custom poster URLs and can restore the remote poster", () => {
    const entry = {
      id: "1",
      posterUrl: "https://image.tmdb.org/t/p/w500/original.jpg",
      usingCustomPoster: false,
    } as any;

    const customized = applyCustomPosterUrl(entry, "data:image/png;base64,abc123");
    expect(customized.posterUrl).toBe("data:image/png;base64,abc123");
    expect(customized.usingCustomPoster).toBe(true);

    const restored = clearCustomPoster(customized, "https://image.tmdb.org/t/p/w500/original.jpg");
    expect(restored.posterUrl).toBe("https://image.tmdb.org/t/p/w500/original.jpg");
    expect(restored.usingCustomPoster).toBe(false);
  });

  it("applies TMDb poster choices without keeping the local custom-poster flag", () => {
    const entry = {
      id: "1",
      posterUrl: "data:image/png;base64,abc123",
      usingCustomPoster: true,
    } as any;

    const updated = applyTmdbPosterUrl(entry, "https://image.tmdb.org/t/p/w500/tmdb.jpg");

    expect(updated.posterUrl).toBe("https://image.tmdb.org/t/p/original/tmdb.jpg");
    expect(updated.usingCustomPoster).toBe(false);
  });
});

describe("tmdbOriginalImageUrl", () => {
  it("upgrades TMDb image sizes to original without changing custom URLs", () => {
    expect(tmdbOriginalImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/original/poster.jpg",
    );
    expect(tmdbOriginalImageUrl("https://image.tmdb.org/t/p/w342/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/original/poster.jpg",
    );
    expect(tmdbOriginalImageUrl("data:image/png;base64,abc123")).toBe("data:image/png;base64,abc123");
    expect(tmdbOriginalImageUrl(null)).toBeNull();
  });
});

describe("compactGridCardState", () => {
  it("converts grid metadata into visual badge flags", () => {
    expect(compactGridCardState({ watchStatus: "watched", favorite: false } as any)).toEqual({
      showActivityDot: true,
      showHeartBadge: false,
    });
    expect(compactGridCardState({ watchStatus: "watching", favorite: true } as any)).toEqual({
      showActivityDot: false,
      showHeartBadge: true,
    });
    expect(compactGridCardState({ watchStatus: "planToWatch", favorite: false } as any)).toEqual({
      showActivityDot: false,
      showHeartBadge: false,
    });
  });
});

describe("applyWatchStatus", () => {
  it("clears score when an entry leaves watched status", () => {
    const entry = { watchStatus: "watched", score: 5 } as any;

    expect(applyWatchStatus(entry, "watching")).toEqual({
      watchStatus: "watching",
      score: null,
    });
    expect(applyWatchStatus(entry, "watched")).toEqual({
      watchStatus: "watched",
      score: 5,
    });
  });
});

describe("tmdbPosterCacheKey", () => {
  it("keys poster choices by TMDb identity", () => {
    expect(tmdbPosterCacheKey({ mediaType: "series", tmdbId: 154521, seasonNumber: null } as any)).toBe(
      "series:154521:main",
    );
    expect(tmdbPosterCacheKey({ mediaType: "season", tmdbId: 154521, seasonNumber: 2 } as any)).toBe(
      "season:154521:2",
    );
    expect(tmdbPosterCacheKey({ mediaType: "movie", tmdbId: -1, seasonNumber: null } as any)).toBeNull();
  });
});

describe("toastAutoDismissDelay", () => {
  it("auto-dismisses visible toast messages only", () => {
    expect(toastAutoDismissDelay("已加入库并同步详情")).toBe(3200);
    expect(toastAutoDismissDelay(null)).toBeNull();
    expect(toastAutoDismissDelay("   ")).toBeNull();
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
        followSystemLanguage: false,
        hideDroppedByDefault: true,
        defaultNewEntryWatchStatus: "watched",
        defaultStatusFilter: "watched",
        defaultFavoriteOnly: true,
        openDetailWithSingleTap: true,
        entryDetailCharactersExpandedByDefault: true,
        entryDetailStaffExpandedByDefault: false,
        episodeProgressTrackingEnabled: true,
        posterProgressBarOverlayEnabled: true,
        autoPrefetchImagesOnAddAndRestore: true,
        useTmdbRelayServer: false,
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
      followSystemLanguage: false,
      hideDroppedByDefault: true,
      defaultNewEntryWatchStatus: "watched",
      defaultStatusFilter: "watched",
      defaultFavoriteOnly: true,
      openDetailWithSingleTap: true,
      entryDetailCharactersExpandedByDefault: true,
      entryDetailStaffExpandedByDefault: false,
      episodeProgressTrackingEnabled: true,
      posterProgressBarOverlayEnabled: true,
      autoPrefetchImagesOnAddAndRestore: true,
      useTmdbRelayServer: false,
    });
  });
});
