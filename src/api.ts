import { invoke } from "@tauri-apps/api/core";
import { parseBackupState } from "./library";
import type { AnimeEntry, AppState, BasicInfo } from "./types";

const mockStateKey = "anishelf.windows.mockState";

const fallbackState: AppState = {
  hasApiKey: false,
  preferences: {
    libraryViewStyle: "gallery",
    sort: "dateSaved",
    sortReversed: false,
    scoringEnabled: true,
    preferredLanguage: "zh-CN",
    theme: "warm",
  },
  entries: [
    {
      id: "series-154521",
      tmdbId: 154521,
      mediaType: "series",
      name: "Frieren: Beyond Journey's End",
      overview:
        "After the party of heroes defeated the Demon King, the elf mage Frieren begins a quieter journey through memory, grief, and new companionship.",
      posterUrl: "https://image.tmdb.org/t/p/w500/dDRiOkCBCkdS2Lop7ua7Qci3b9A.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w500/jm2z9pWlVV6kZsugOMk0nOyn8i8.jpg",
      detailsUrl: null,
      originalLanguageCode: "ja",
      onAirDate: "2023-09-29",
      watchStatus: "watching",
      dateSaved: "2026-02-03T10:00:00Z",
      dateStarted: "2026-02-04",
      dateFinished: null,
      isDateTrackingEnabled: true,
      score: 5,
      favorite: true,
      notes: "Quiet fantasy, excellent pacing.",
      usingCustomPoster: false,
    },
    {
      id: "movie-149",
      tmdbId: 149,
      mediaType: "movie",
      name: "Akira",
      overview:
        "A landmark animated film set in Neo Tokyo, following a biker gang member whose psychic power spirals beyond control.",
      posterUrl: "https://image.tmdb.org/t/p/w500/neZ0ykEsPqxamsX6o5QNUFILQrz.jpg",
      backdropUrl: null,
      detailsUrl: null,
      originalLanguageCode: "ja",
      onAirDate: "1988-07-16",
      watchStatus: "watched",
      dateSaved: "2026-01-18T12:00:00Z",
      dateStarted: "2026-01-18",
      dateFinished: "2026-01-18",
      isDateTrackingEnabled: true,
      score: 5,
      favorite: false,
      notes: "",
      usingCustomPoster: false,
    },
    {
      id: "series-85937",
      tmdbId: 85937,
      mediaType: "series",
      name: "Demon Slayer: Kimetsu no Yaiba",
      overview:
        "A young swordsman joins the Demon Slayer Corps while seeking a cure for his sister.",
      posterUrl: "https://image.tmdb.org/t/p/w500/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg",
      backdropUrl: null,
      detailsUrl: null,
      originalLanguageCode: "ja",
      onAirDate: "2019-04-06",
      watchStatus: "planToWatch",
      dateSaved: "2026-01-09T09:00:00Z",
      dateStarted: null,
      dateFinished: null,
      isDateTrackingEnabled: true,
      score: null,
      favorite: true,
      notes: "",
      usingCustomPoster: false,
    },
  ],
};

export async function getAppState(): Promise<AppState> {
  if (isTauriRuntime()) {
    return invoke<AppState>("get_app_state");
  }
  return loadMockState();
}

export async function saveApiKey(apiKey: string): Promise<AppState> {
  if (isTauriRuntime()) {
    return invoke<AppState>("save_api_key", { apiKey });
  }
  const state = { ...loadMockState(), hasApiKey: apiKey.trim().length > 0 };
  saveMockState(state);
  return state;
}

export async function searchTmdb(query: string, language: string): Promise<BasicInfo[]> {
  if (isTauriRuntime()) {
    return invoke<BasicInfo[]>("search_tmdb", { request: { query, language } });
  }
  const normalized = query.trim().toLocaleLowerCase();
  return mockSearchResults.filter((result) =>
    result.name.toLocaleLowerCase().includes(normalized || "frieren"),
  );
}

export async function addEntry(info: BasicInfo): Promise<AnimeEntry> {
  if (isTauriRuntime()) {
    return invoke<AnimeEntry>("add_entry", { info });
  }
  const entry = entryFromBasicInfo(info);
  const state = loadMockState();
  const entries = [entry, ...state.entries.filter((item) => item.id !== entry.id)];
  saveMockState({ ...state, entries });
  return entry;
}

export async function updateEntry(entry: AnimeEntry): Promise<AnimeEntry> {
  if (isTauriRuntime()) {
    return invoke<AnimeEntry>("update_entry", { entry });
  }
  const state = loadMockState();
  saveMockState({
    ...state,
    entries: state.entries.map((item) => (item.id === entry.id ? entry : item)),
  });
  return entry;
}

export async function deleteEntry(id: string): Promise<AppState> {
  if (isTauriRuntime()) {
    return invoke<AppState>("delete_entry", { id });
  }
  const state = loadMockState();
  const next = { ...state, entries: state.entries.filter((entry) => entry.id !== id) };
  saveMockState(next);
  return next;
}

export async function exportLibrary(): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>("export_library");
  }
  return JSON.stringify(loadMockState(), null, 2);
}

export async function restoreBackup(backupJson: string): Promise<AppState> {
  if (isTauriRuntime()) {
    return invoke<AppState>("restore_backup", { backupJson });
  }
  const restored = parseBackupState(backupJson);
  const next = { ...restored, hasApiKey: loadMockState().hasApiKey };
  saveMockState(next);
  return next;
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function loadMockState(): AppState {
  const raw = localStorage.getItem(mockStateKey);
  if (!raw) {
    return fallbackState;
  }
  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return fallbackState;
  }
}

function saveMockState(state: AppState): void {
  localStorage.setItem(mockStateKey, JSON.stringify(state));
}

function entryFromBasicInfo(info: BasicInfo): AnimeEntry {
  return {
    id: `${info.mediaType}-${info.tmdbId}${info.seasonNumber ? `-${info.seasonNumber}` : ""}`,
    tmdbId: info.tmdbId,
    mediaType: info.mediaType,
    seasonNumber: info.seasonNumber ?? null,
    parentSeriesId: info.parentSeriesId ?? null,
    name: info.name,
    overview: info.overview ?? null,
    posterUrl: info.posterUrl ?? null,
    backdropUrl: info.backdropUrl ?? null,
    detailsUrl: null,
    originalLanguageCode: null,
    onAirDate: info.onAirDate ?? null,
    watchStatus: "planToWatch",
    dateSaved: new Date().toISOString(),
    dateStarted: null,
    dateFinished: null,
    isDateTrackingEnabled: true,
    score: null,
    favorite: false,
    notes: "",
    usingCustomPoster: false,
  };
}

const mockSearchResults: BasicInfo[] = [
  {
    tmdbId: 154521,
    mediaType: "series",
    name: "Frieren: Beyond Journey's End",
    overview: "An elf mage retraces the meaning of the journey after victory.",
    posterUrl: "https://image.tmdb.org/t/p/w500/dDRiOkCBCkdS2Lop7ua7Qci3b9A.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w500/jm2z9pWlVV6kZsugOMk0nOyn8i8.jpg",
    onAirDate: "2023-09-29",
  },
  {
    tmdbId: 149,
    mediaType: "movie",
    name: "Akira",
    overview: "A cyberpunk anime landmark set in Neo Tokyo.",
    posterUrl: "https://image.tmdb.org/t/p/w500/neZ0ykEsPqxamsX6o5QNUFILQrz.jpg",
    backdropUrl: null,
    onAirDate: "1988-07-16",
  },
];
