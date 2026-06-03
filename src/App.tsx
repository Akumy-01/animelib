import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Download,
  ExternalLink,
  Film,
  Github,
  Grid2X2,
  Heart,
  Images,
  Info,
  KeyRound,
  List,
  Loader2,
  Globe2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";

import {
  addEntry,
  deleteEntry,
  detailForEntry,
  episodeProgressForEntry,
  exportLibrary,
  exportLibraryToJsonFile,
  getAppState,
  posterOptionsForEntry,
  refreshEntryDetail,
  restoreBackup,
  saveApiKey,
  savePreferences,
  searchTmdb,
  updateEntry,
} from "./api";
import {
  applyEntryDefaults,
  applyTmdbPosterUrl,
  applyWatchStatus,
  buildPreferences,
  combineEpisodesWithProgress,
  compactGridCardState,
  defaultAppPreferences,
  deriveLibraryStats,
  filterEntries,
  filtersFromPreferences,
  mediaTypeLabel,
  chunkBatchPrompts,
  isSupportedLibraryImportFile,
  keyboardShortcutAction,
  parseBatchPrompts,
  shouldRenderRemoteImage,
  sortEntries,
  tmdbOriginalImageUrl,
  tmdbPosterCacheKey,
  toastAutoDismissDelay,
  updateQueryFilter,
  updateEntryInList,
  watchStatusLabel,
} from "./library";
import type {
  AnimeDetail,
  AnimeEntry,
  AppPreferences,
  BasicInfo,
  EpisodeProgress,
  EpisodeWithProgress,
  LibraryFilters,
  LibrarySort,
  LibraryViewStyle,
  PosterOption,
  StaffSummary,
  WatchStatus,
} from "./types";

const appVersion = packageJson.version;
const animelibGithubUrl = "https://github.com/Akumy-01/animelib";

type Sheet = "search" | "settings" | "profile" | "export" | null;

const fallbackPersonImageUrl = new URL("./assets/animelib-placeholder.png", import.meta.url).href;
const viewStyles: LibraryViewStyle[] = ["gallery", "list", "grid"];
const sortOptions: LibrarySort[] = ["dateSaved", "title", "releaseDate", "score"];
const visibleWatchStatuses: WatchStatus[] = ["watched", "watching", "planToWatch"];
const newEntryWatchStatuses: WatchStatus[] = ["planToWatch", "watching", "watched"];
type PreferenceBase = Omit<AppPreferences, "libraryViewStyle" | "sort" | "sortReversed">;

function visibleStatusFilterValue(status?: WatchStatus | "all"): WatchStatus | "all" {
  return status && visibleWatchStatuses.includes(status as WatchStatus) ? (status as WatchStatus) : "all";
}

function visibleNewEntryStatusValue(status: WatchStatus): WatchStatus {
  return visibleWatchStatuses.includes(status) ? status : "planToWatch";
}

function normalizeLibraryFilters(filters: LibraryFilters): LibraryFilters {
  return {
    ...filters,
    status: visibleStatusFilterValue(filters.status),
  };
}

export function App() {
  const [entries, setEntries] = useState<AnimeEntry[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewStyle, setViewStyle] = useState<LibraryViewStyle>("gallery");
  const [sort, setSort] = useState<LibrarySort>("dateSaved");
  const [sortReversed, setSortReversed] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [galleryDetailOpen, setGalleryDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [preferenceBase, setPreferenceBase] = useState<PreferenceBase>(
    preferenceBaseFromPreferences(defaultAppPreferences),
  );
  const [filters, setFilters] = useState<LibraryFilters>({ status: "all" });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [details, setDetails] = useState<Record<string, AnimeDetail | null>>({});
  const [episodeProgress, setEpisodeProgress] = useState<Record<string, EpisodeProgress[]>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const metadataRepairStartedRef = useRef(false);
  const autoDetailLoadRef = useRef<Set<string>>(new Set());
  const libraryPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    getAppState()
      .then((state) => {
        setEntries(state.entries);
        setHasApiKey(state.hasApiKey);
        setViewStyle(state.preferences.libraryViewStyle);
        setSort(state.preferences.sort);
        setSortReversed(state.preferences.sortReversed);
        setPreferenceBase(preferenceBaseFromPreferences(state.preferences));
        setFilters(normalizeLibraryFilters(filtersFromPreferences(state.preferences)));
        setSelectedId(state.entries[0]?.id ?? null);
        if (!state.hasApiKey) {
          setSheet("settings");
        }
      })
      .catch((error) => setToast(String(error)))
      .finally(() => setLoading(false));
  }, []);

  const visibleEntries = useMemo(
    () => sortEntries(filterEntries(entries, normalizeLibraryFilters(filters)), sort, sortReversed),
    [entries, filters, sort, sortReversed],
  );
  const preferences = useMemo(
    () =>
      buildPreferences(
        {
          ...preferenceBase,
          libraryViewStyle: viewStyle,
          sort,
          sortReversed,
        },
        {
          libraryViewStyle: viewStyle,
          sort,
          sortReversed,
        },
      ),
    [preferenceBase, sort, sortReversed, viewStyle],
  );
  const stats = useMemo(() => deriveLibraryStats(entries), [entries]);
  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? entries[0] ?? null;

  useEffect(() => {
    if (loading) {
      return;
    }
    savePreferences(preferences).catch((error) => setToast(String(error)));
  }, [loading, preferences]);

  useEffect(() => {
    const delay = toastAutoDismissDelay(toast);
    if (!delay) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), delay);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(entries.map((entry) => entry.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  useEffect(() => {
    if (libraryPanelRef.current) {
      libraryPanelRef.current.scrollTop = 0;
    }
    if (viewStyle === "gallery") {
      setGalleryDetailOpen(false);
    }
  }, [viewStyle]);

  async function persistEntry(entry: AnimeEntry) {
    const saved = await updateEntry(entry);
    setEntries((current) => updateEntryInList(current, saved));
    setSelectedId(saved.id);
  }

  function applyPreferences(next: AppPreferences) {
    setViewStyle(next.libraryViewStyle);
    setSort(next.sort);
    setSortReversed(next.sortReversed);
    setPreferenceBase(preferenceBaseFromPreferences(next));
  }

  function applyRefreshedEntry(previousId: string, refreshed: AnimeEntry, select = false) {
    setEntries((current) => {
      let inserted = false;
      const next = current.flatMap((item) => {
        if (item.id === previousId || item.id === refreshed.id) {
          if (inserted) {
            return [];
          }
          inserted = true;
          return [refreshed];
        }
        return [item];
      });
      return inserted ? next : [refreshed, ...current];
    });
    setSelectedId((current) => (select || current === previousId || current === refreshed.id ? refreshed.id : current));
  }

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }
    detailForEntry(selectedEntry.id)
      .then((detail) => setDetails((current) => ({ ...current, [selectedEntry.id]: detail })))
      .catch((error) => setToast(String(error)));
    episodeProgressForEntry(selectedEntry.id)
      .then((progress) => setEpisodeProgress((current) => ({ ...current, [selectedEntry.id]: progress })))
      .catch((error) => setToast(String(error)));
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (!selectedEntry || !hasApiKey || selectedEntry.tmdbId <= 0) {
      return;
    }
    const refreshKey = `${selectedEntry.id}:${preferences.preferredLanguage}`;
    if (autoDetailLoadRef.current.has(refreshKey)) {
      return;
    }

    let cancelled = false;
    autoDetailLoadRef.current.add(refreshKey);
    void refreshEntryDetailWithRetry(selectedEntry, preferences.preferredLanguage)
      .then((result) => {
        if (cancelled) {
          return;
        }
        applyRefreshedEntry(selectedEntry.id, result.entry);
        setDetails((current) => ({ ...current, [result.entry.id]: result.detail }));
      })
      .catch(() => {
        autoDetailLoadRef.current.delete(refreshKey);
      });

    return () => {
      cancelled = true;
    };
  }, [hasApiKey, preferences.preferredLanguage, selectedEntry?.id, selectedEntry?.tmdbId]);

  async function refreshDetail(entry: AnimeEntry) {
    try {
      const result = await refreshEntryDetailWithRetry(entry, preferences.preferredLanguage);
      applyRefreshedEntry(entry.id, result.entry, true);
      setDetails((current) => ({ ...current, [result.entry.id]: result.detail }));
      setToast("详情已刷新");
    } catch (error) {
      setToast(String(error));
    }
  }

  async function removeEntry(entry: AnimeEntry) {
    const state = await deleteEntry(entry.id);
    setEntries(state.entries);
    setSelectedId(state.entries[0]?.id ?? null);
    setToast("已删除条目");
  }

  async function removeSelectedEntries() {
    const ids = [...selectedIds];
    if (!ids.length) {
      return;
    }
    let state = null as Awaited<ReturnType<typeof deleteEntry>> | null;
    for (const id of ids) {
      state = await deleteEntry(id);
    }
    if (state) {
      setEntries(state.entries);
      setSelectedId(state.entries.find((entry) => entry.id === selectedId)?.id ?? state.entries[0]?.id ?? null);
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
    setToast(`已删除 ${ids.length} 个条目`);
  }

  async function downloadLibraryJson() {
    try {
      const savedPath = await exportLibraryToJsonFile();
      if (!savedPath) {
        return;
      }
      setToast("已导出 JSON 备份");
    } catch (error) {
      setToast(String(error));
      setSheet("export");
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((active) => {
      if (active) {
        setSelectedIds(new Set());
      }
      return !active;
    });
  }

  function handleEntryClick(entry: AnimeEntry) {
    if (!selectionMode) {
      setSelectedId(entry.id);
      return;
    }
    setSelectedId(entry.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  }

  function handleEntryDoubleClick(entry: AnimeEntry) {
    if (viewStyle !== "gallery" || selectionMode) {
      return;
    }
    setSelectedId(entry.id);
    setGalleryDetailOpen((open) => (entry.id === selectedId ? !open : true));
  }

  function handleLibraryScroll() {
    if (viewStyle !== "gallery" || selectionMode) {
      return;
    }
    const panel = libraryPanelRef.current;
    if (!panel) {
      return;
    }
    const panelTop = panel.getBoundingClientRect().top;
    let closestId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    panel.querySelectorAll<HTMLElement>(".entry-card.gallery").forEach((card) => {
      const distance = Math.abs(card.getBoundingClientRect().top - panelTop);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = card.dataset.entryId ?? null;
      }
    });
    if (closestId && closestId !== selectedId) {
      setSelectedId(closestId);
    }
  }

  useEffect(() => {
    if (
      loading ||
      !hasApiKey ||
      metadataRepairStartedRef.current ||
      !preferences.autoPrefetchImagesOnAddAndRestore
    ) {
      return;
    }
    const targets = entries
      .filter(needsMetadataRefresh)
      .sort((left, right) => Number(left.tmdbId > 0) - Number(right.tmdbId > 0));
    if (targets.length === 0) {
      return;
    }

    let cancelled = false;
    metadataRepairStartedRef.current = true;
    setToast(`正在同步 ${targets.length} 个条目的 TMDb 信息`);
    void (async () => {
      let synced = 0;
      for (const entry of targets) {
        if (cancelled) {
          return;
        }
        try {
          const result = await refreshEntryDetailWithRetry(entry, preferences.preferredLanguage);
          applyRefreshedEntry(entry.id, result.entry);
          setDetails((current) => ({ ...current, [result.entry.id]: result.detail }));
          synced += 1;
        } catch {
          // Keep syncing the rest of the library; a single title may not exist on TMDb.
        }
      }
      if (!cancelled) {
        setToast(`已同步 ${synced}/${targets.length} 个条目的 TMDb 信息`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entries.length, hasApiKey, loading, preferences.autoPrefetchImagesOnAddAndRestore, preferences.preferredLanguage]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const action = keyboardShortcutAction(event);
      if (!action) {
        return;
      }

      event.preventDefault();
      if (action === "search") {
        setSheet("search");
      } else if (action === "settings") {
        setSheet("settings");
      } else if (action === "export") {
        setSheet("export");
      } else if (action === "refreshDetail" && selectedEntry) {
        void refreshDetail(selectedEntry);
      } else if (action === "viewGallery") {
        setViewStyle("gallery");
      } else if (action === "viewList") {
        setViewStyle("list");
      } else if (action === "viewGrid") {
        setViewStyle("grid");
      } else if (action === "closeSheet") {
        setSheet(null);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [selectedEntry]);

  return (
    <main className={`app-shell ${sheet ? "sheet-open" : ""}`}>
      <section className="library-stage">
        <header className="topbar">
          <div className="topbar-actions">
            <button className={`text-button ${selectionMode ? "active" : ""}`} onClick={toggleSelectionMode}>
              {selectionMode ? "取消" : "选择"}
            </button>
            {selectionMode ? (
              <button className="danger-button compact-action" onClick={removeSelectedEntries} disabled={!selectedIds.size}>
                <Trash2 size={16} /> 删除 {selectedIds.size}
              </button>
            ) : null}
            <div className="library-controls" aria-label="库视图与筛选">
              <div className="segmented">
                {viewStyles.map((style) => (
                  <button
                    key={style}
                    className={style === viewStyle ? "active" : ""}
                    onClick={() => setViewStyle(style)}
                    title={viewStyleLabel(style)}
                  >
                    {style === "gallery" ? <Images size={18} /> : style === "list" ? <List size={18} /> : <Grid2X2 size={18} />}
                  </button>
                ))}
              </div>

              <label className="filter-search" aria-label="按标题筛选库">
                <Search size={16} />
                <input
                  value={filters.query ?? ""}
                  onChange={(event) => setFilters(updateQueryFilter(filters, event.target.value))}
                  placeholder="筛选标题"
                />
              </label>

              <button
                className={`filter-pill favorite-filter ${filters.favoriteOnly ? "active" : ""}`}
                aria-label={filters.favoriteOnly ? "只看收藏" : "显示全部条目"}
                title={filters.favoriteOnly ? "只看收藏" : "显示全部条目"}
                onClick={() => setFilters({ ...filters, favoriteOnly: !filters.favoriteOnly })}
              >
                <Heart size={16} fill={filters.favoriteOnly ? "currentColor" : "none"} />
              </button>

              <select value={visibleStatusFilterValue(filters.status)} onChange={(event) => setFilters({ ...filters, status: event.target.value as WatchStatus | "all" })}>
                <option value="all">全部</option>
                {visibleWatchStatuses.map((status) => (
                  <option key={status} value={status}>
                    {watchStatusLabel(status)}
                  </option>
                ))}
              </select>

              <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    {sortLabel(option)}
                  </option>
                ))}
              </select>

              <button className="icon-button" aria-label="反转排序" onClick={() => setSortReversed(!sortReversed)}>
                {sortReversed ? "↓" : "↑"}
              </button>
            </div>
            <button className="title-capsule" onClick={() => setSheet("profile")}>
              <span>animelib</span>
              <strong>{visibleEntries.length} 部</strong>
            </button>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button top-search-button" onClick={() => setSheet("search")}>
              <Search size={17} /> 搜索
            </button>
            <button className="icon-button" aria-label="设置" onClick={() => setSheet("settings")}>
              <Settings size={20} />
            </button>
          </div>
        </header>

        <section className={`content-grid ${viewStyle} ${viewStyle === "gallery" && galleryDetailOpen ? "gallery-detail-open" : "gallery-detail-collapsed"}`}>
          <section ref={libraryPanelRef} className={`library-panel ${viewStyle}`} onScroll={handleLibraryScroll}>
            {loading ? (
              <div className="center-state">
                <Loader2 className="spin" />
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="center-state">
                <Images size={36} />
                <h2>还没有动漫</h2>
                <button className="primary-button" onClick={() => setSheet("search")}>
                  <Plus size={18} /> 添加动漫
                </button>
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  selected={selectionMode ? selectedIds.has(entry.id) : entry.id === selectedEntry?.id}
                  checked={selectedIds.has(entry.id)}
                  selectionMode={selectionMode}
                  viewStyle={viewStyle}
                  onClick={() => handleEntryClick(entry)}
                  onDoubleClick={() => handleEntryDoubleClick(entry)}
                  onToggleFavorite={() => void persistEntry({ ...entry, favorite: !entry.favorite })}
                />
              ))
            )}
          </section>

          {(viewStyle !== "gallery" || galleryDetailOpen) ? (
            <DetailPanel
              entry={selectedEntry}
              detail={selectedEntry ? details[selectedEntry.id] ?? null : null}
              progress={selectedEntry ? episodeProgress[selectedEntry.id] ?? [] : []}
              hasApiKey={hasApiKey}
              preferences={preferences}
              showHero={viewStyle !== "gallery"}
              onChange={persistEntry}
              onDelete={removeEntry}
            />
          ) : null}
        </section>

      </section>

      {sheet === "search" && (
        <SearchSheet
          hasApiKey={hasApiKey}
          initialLanguage={preferences.preferredLanguage}
          onClose={() => setSheet(null)}
          onAdd={async (info) => {
            const added = await addEntry(info);
            const entryWithDefaults = applyEntryDefaults(added, preferences);
            const entry =
              entryWithDefaults.watchStatus === added.watchStatus && entryWithDefaults.score === added.score
                ? added
                : await updateEntry(entryWithDefaults);
            setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
            setSelectedId(entry.id);
            try {
              const result = await refreshEntryDetailWithRetry(entry, preferences.preferredLanguage);
              applyRefreshedEntry(entry.id, result.entry, true);
              setDetails((current) => ({ ...current, [result.entry.id]: result.detail }));
              setToast("已加入库并同步详情");
            } catch (error) {
              setToast(`已加入库，详情同步失败：${String(error)}`);
            }
          }}
          onNeedApiKey={() => setSheet("settings")}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          hasApiKey={hasApiKey}
          preferences={preferences}
          onPreferencesChange={applyPreferences}
          onClose={() => setSheet(null)}
          onSave={async (apiKey) => {
            const state = await saveApiKey(apiKey);
            setHasApiKey(state.hasApiKey);
            setToast("TMDb API Key 已保存");
          }}
        />
      )}
      {sheet === "profile" && <ProfileSheet stats={stats} onExport={() => void downloadLibraryJson()} onClose={() => setSheet(null)} />}
      {sheet === "export" && (
        <ExportSheet
          onClose={() => setSheet(null)}
          onRestore={(state) => {
            setEntries(state.entries);
            applyPreferences(state.preferences);
            setFilters(normalizeLibraryFilters(filtersFromPreferences(state.preferences)));
            setSelectedId(state.entries[0]?.id ?? null);
            metadataRepairStartedRef.current = false;
            setToast("库已恢复");
          }}
        />
      )}

      {toast && (
        <button className="toast" onClick={() => setToast(null)}>
          {toast}
        </button>
      )}
    </main>
  );
}

function EntryCard({
  entry,
  selected,
  checked,
  selectionMode,
  viewStyle,
  onClick,
  onDoubleClick,
  onToggleFavorite,
}: {
  entry: AnimeEntry;
  selected: boolean;
  checked: boolean;
  selectionMode: boolean;
  viewStyle: LibraryViewStyle;
  onClick: () => void;
  onDoubleClick: () => void;
  onToggleFavorite: () => void;
}) {
  const compactState = compactGridCardState(entry);
  const isGrid = viewStyle === "grid";

  return (
    <div
      className={`entry-card ${viewStyle} ${selected ? "selected" : ""}`}
      data-entry-id={entry.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        onDoubleClick();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="card-poster-frame">
        <Poster entry={entry} />
        {isGrid && compactState.showActivityDot ? <span className="grid-activity-dot" aria-hidden="true" /> : null}
        {isGrid && !selectionMode ? (
          <button
            className={`grid-heart-badge ${compactState.showHeartBadge ? "active" : ""}`}
            aria-label={entry.favorite ? "取消收藏" : "收藏"}
            aria-pressed={entry.favorite}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Heart size={14} fill={entry.favorite ? "currentColor" : "none"} />
          </button>
        ) : null}
      </div>
      {selectionMode ? (
        <span className={`selection-check ${checked ? "checked" : ""}`} aria-hidden="true">
          <CheckCircle2 size={18} />
        </span>
      ) : null}
      <div className="entry-copy">
        <div className="entry-title-row">
          <h3>{entry.name}</h3>
          {!isGrid && entry.favorite ? <Heart size={15} fill="currentColor" /> : null}
        </div>
        <p>{mediaTypeLabel(entry.mediaType)} / {entry.onAirDate?.slice(0, 4) ?? "未知年份"}</p>
        <span>{watchStatusLabel(entry.watchStatus)}</span>
        {viewStyle === "list" ? <p className="entry-overview">{entry.overview?.trim() || "暂无简介。"}</p> : null}
      </div>
    </div>
  );
}

function Poster({ entry }: { entry: AnimeEntry }) {
  const [failed, setFailed] = useState(false);
  const posterUrl = tmdbOriginalImageUrl(entry.posterUrl);

  useEffect(() => {
    setFailed(false);
  }, [entry.posterUrl]);

  if (shouldRenderRemoteImage(posterUrl, failed)) {
    return <img className="poster" src={posterUrl ?? ""} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <div className="poster poster-fallback">
      <Film size={28} />
    </div>
  );
}

function DetailImage({ src, className, iconSize }: { src?: string | null; className: string; iconSize: number }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = tmdbOriginalImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (shouldRenderRemoteImage(imageUrl, failed)) {
    return <img className={className} src={imageUrl ?? ""} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${className} image-fallback`}>
      <Film size={iconSize} />
    </div>
  );
}

function PersonImage({ src, className }: { src?: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = tmdbOriginalImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      className={className}
      src={shouldRenderRemoteImage(imageUrl, failed) ? imageUrl ?? fallbackPersonImageUrl : fallbackPersonImageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function DetailHeroImage({ entry }: { entry: AnimeEntry }) {
  const candidates = [entry.posterUrl, entry.backdropUrl]
    .map((url) => tmdbOriginalImageUrl(url))
    .filter((url): url is string => Boolean(url?.trim()));
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex] ?? null;

  useEffect(() => {
    setCandidateIndex(0);
  }, [entry.posterUrl, entry.backdropUrl]);

  if (src) {
    return (
      <img
        className="detail-hero-image"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setCandidateIndex((current) => current + 1)}
      />
    );
  }
  return (
    <div className="detail-hero-image image-fallback">
      <Film size={34} />
    </div>
  );
}

function DetailPanel({
  entry,
  detail,
  progress,
  hasApiKey,
  preferences,
  showHero,
  onChange,
  onDelete,
}: {
  entry: AnimeEntry | null;
  detail: AnimeDetail | null;
  progress: EpisodeProgress[];
  hasApiKey: boolean;
  preferences: AppPreferences;
  showHero: boolean;
  onChange: (entry: AnimeEntry) => Promise<void>;
  onDelete: (entry: AnimeEntry) => Promise<void>;
}) {
  const [draftNotes, setDraftNotes] = useState(entry?.notes ?? "");
  const [posterPickerOpen, setPosterPickerOpen] = useState(false);
  const [posterOptions, setPosterOptions] = useState<PosterOption[]>([]);
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [openEpisodeGroups, setOpenEpisodeGroups] = useState<Set<string>>(() => new Set());
  const [expandedEpisodeIds, setExpandedEpisodeIds] = useState<Set<number>>(() => new Set());
  const posterOptionsCacheRef = useRef<Record<string, PosterOption[]>>({});
  const posterPickerRef = useRef<HTMLElement | null>(null);
  const posterChoices = useMemo(() => mergeCurrentPosterOption(entry, posterOptions), [entry, posterOptions]);

  useEffect(() => {
    setDraftNotes(entry?.notes ?? "");
  }, [entry?.id, entry?.notes]);

  useEffect(() => {
    const cacheKey = entry ? tmdbPosterCacheKey(entry) : null;
    setPosterPickerOpen(false);
    setPosterOptions(cacheKey ? posterOptionsCacheRef.current[cacheKey] ?? [] : []);
    setPosterError(null);
    setTrackingOpen(false);
    setOpenEpisodeGroups(new Set());
    setExpandedEpisodeIds(new Set());
  }, [entry?.id]);

  useEffect(() => {
    const cacheKey = entry ? tmdbPosterCacheKey(entry) : null;
    if (!entry || !hasApiKey || entry.tmdbId <= 0 || !cacheKey || posterOptionsCacheRef.current[cacheKey]) {
      return;
    }

    let cancelled = false;
    void posterOptionsForEntry(entry)
      .then((options) => {
        if (cancelled) {
          return;
        }
        posterOptionsCacheRef.current[cacheKey] = options;
        setPosterOptions(options);
      })
      .catch(() => {
        // Silent prefetch: manual opening of the picker will still surface errors.
      });

    return () => {
      cancelled = true;
    };
  }, [entry?.id, entry?.mediaType, entry?.seasonNumber, entry?.tmdbId, hasApiKey]);

  useEffect(() => {
    if (!posterPickerOpen) {
      return;
    }
    const timeout = window.setTimeout(() => {
      posterPickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(timeout);
  }, [posterPickerOpen]);

  async function openPosterPicker() {
    if (!entry) {
      return;
    }
    setPosterPickerOpen(true);
    setPosterError(null);
    const cacheKey = tmdbPosterCacheKey(entry);
    if (cacheKey && posterOptionsCacheRef.current[cacheKey]) {
      setPosterOptions(posterOptionsCacheRef.current[cacheKey]);
      setPosterLoading(false);
      return;
    }
    setPosterLoading(true);
    try {
      const options = await posterOptionsForEntry(entry);
      setPosterOptions(options);
      if (cacheKey) {
        posterOptionsCacheRef.current[cacheKey] = options;
      }
    } catch (error) {
      setPosterError(error instanceof Error ? error.message : String(error));
    } finally {
      setPosterLoading(false);
    }
  }

  async function choosePoster(option: PosterOption) {
    if (!entry) {
      return;
    }
    await onChange(applyTmdbPosterUrl(entry, option.url));
    setPosterPickerOpen(false);
  }

  if (!entry) {
    return (
      <aside className="detail-panel empty-detail">
        <Film size={34} />
        <h2>请选择条目</h2>
      </aside>
    );
  }

  const episodes = detail ? combineEpisodesWithProgress(detail.episodes, progress) : [];
  const characters = detail?.characters ?? [];
  const staffMembers = detail?.staff ?? [];
  const episodeCount = detailEpisodeCount(detail);
  const episodeGroups = buildEpisodeGroups(detail, episodes);
  const overviewMetaLabel = detailOverviewMetaLabel(detail);

  function toggleEpisodeGroup(groupId: string) {
    setOpenEpisodeGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function toggleEpisodeOverview(episodeId: number) {
    setExpandedEpisodeIds((current) => {
      const next = new Set(current);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  }

  return (
    <aside className="detail-panel">
      {showHero ? (
        <section className="detail-hero-card">
          <div className="detail-hero-media">
            <DetailHeroImage entry={entry} />
            <div className="detail-hero-shade" aria-hidden="true" />
            <div className="detail-hero-copy">
              <span>{mediaTypeLabel(entry.mediaType)}</span>
              <h2>{entry.name}</h2>
              <p>
                {[entry.onAirDate?.slice(0, 4), watchStatusLabel(entry.watchStatus), episodeCount ? `${episodeCount} 集` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="detail-hero-actions">
              <button className="hero-icon-button" onClick={openPosterPicker} disabled={posterLoading} aria-label="从 TMDb 更换海报">
                {posterLoading ? <Loader2 size={18} className="spin" /> : <Images size={18} />}
              </button>
              <button
                className={`hero-icon-button favorite ${entry.favorite ? "active" : ""}`}
                onClick={() => onChange({ ...entry, favorite: !entry.favorite })}
                aria-label={entry.favorite ? "取消收藏" : "收藏"}
                aria-pressed={entry.favorite}
              >
                <Heart size={18} fill={entry.favorite ? "currentColor" : "none"} />
              </button>
            </div>
            <section className="detail-data-grid hero-metrics-grid" aria-label="条目数据">
              <DetailMetricCard className="rating" icon={<Star size={18} fill="currentColor" />} value={detailRatingLabel(detail, entry)} label="评分" />
              <DetailMetricCard className="episodes" icon={<Play size={18} fill="currentColor" />} value={episodeCount ? String(episodeCount) : "未知"} label="集数" />
              <DetailMetricCard className="runtime" icon={<Clock size={18} />} value={detailRuntimeLabel(detail)} label="平均时长" />
            </section>
          </div>
        </section>
      ) : null}

      {posterPickerOpen ? (
        <section ref={posterPickerRef} className="detail-section poster-picker">
          <div className="poster-picker-header">
            <div>
              <h3>选择 TMDb 海报</h3>
              <p>来自当前条目的 TMDb 图片集。</p>
            </div>
            <button className="icon-button" onClick={() => setPosterPickerOpen(false)} aria-label="关闭海报选择">
              <X size={17} />
            </button>
          </div>
          {posterError ? <p className="error-text">{posterError}</p> : null}
          {posterLoading ? <p>正在读取 TMDb 海报...</p> : null}
          {!posterLoading && posterChoices.length ? (
            <div className="poster-option-grid">
              {posterChoices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`poster-option ${tmdbOriginalImageUrl(entry.posterUrl) === tmdbOriginalImageUrl(option.url) ? "selected" : ""}`}
                  onClick={() => void choosePoster(option)}
                  title={posterOptionLabel(option)}
                >
                  <div className="poster-option-frame">
                    <img src={tmdbOriginalImageUrl(option.previewUrl || option.url) ?? option.url} alt="" loading="lazy" decoding="async" />
                  </div>
                  <span className="poster-option-meta">{posterOptionLabel(option)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!posterLoading && !posterChoices.length && !posterError ? <p>TMDb 暂无可选海报。</p> : null}
        </section>
      ) : null}

      <section className="detail-section overview-section">
        <div className="section-title-row">
          <h3>简介</h3>
          {overviewMetaLabel ? <span className="metadata-pill">{overviewMetaLabel}</span> : null}
        </div>
        <p>{detail?.overview || entry.overview || "暂无简介。"}</p>
      </section>

      <section className={`tracking-accordion tracking-card ${trackingOpen ? "open" : ""}`}>
        <div className="tracking-score-panel">
          <div className="tracking-score-header">
            <span>
              <Star size={18} />
              评分
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...entry, score: null })}
              disabled={!preferences.scoringEnabled || entry.score == null}
            >
              清除
            </button>
          </div>
          {preferences.scoringEnabled ? (
            <div className="rating-stars" aria-label="评分">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  className={typeof entry.score === "number" && entry.score >= score ? "active" : ""}
                  aria-label={`${score}/5`}
                  aria-pressed={entry.score === score}
                  onClick={() => onChange({ ...applyWatchStatus(entry, "watched"), score })}
                >
                  <Star size={30} fill="currentColor" />
                </button>
              ))}
            </div>
          ) : (
            <p className="tracking-muted">评分已在设置中关闭。</p>
          )}
        </div>
        <button
          className="tracking-accordion-header"
          type="button"
          aria-expanded={trackingOpen}
          onClick={() => setTrackingOpen((open) => !open)}
        >
          <span className="tracking-title">
            <SlidersHorizontal size={18} />
            追踪
          </span>
          <ChevronDown size={20} />
        </button>
        <div className="tracking-accordion-body" aria-hidden={!trackingOpen}>
          <div className="tracking-grid">
            <label>
              <span>状态</span>
              <select value={visibleWatchStatuses.includes(entry.watchStatus) ? entry.watchStatus : "planToWatch"} onChange={(event) => onChange(applyWatchStatus(entry, event.target.value as WatchStatus))}>
                {visibleWatchStatuses.map((status) => (
                  <option key={status} value={status}>
                    {watchStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>开始日期</span>
              <input type="date" value={dateInput(entry.dateStarted)} onChange={(event) => onChange({ ...entry, dateStarted: event.target.value || null })} />
            </label>
          </div>
        </div>
      </section>

      {episodeGroups.length ? (
        <section className="detail-section episode-accordion-section">
          <div className="section-title-row">
            <h3>
              <Film size={18} />
              集数
            </h3>
          </div>
          <div className="episode-group-list">
            {episodeGroups.map((group) => {
              const groupOpen = openEpisodeGroups.has(group.id);
              return (
                <article key={group.id} className={`episode-group-card ${groupOpen ? "open" : ""}`}>
                  <button
                    className="episode-group-header"
                    type="button"
                    aria-expanded={groupOpen}
                    onClick={() => toggleEpisodeGroup(group.id)}
                  >
                    <ChevronDown size={19} />
                    <div>
                      <strong>{group.title}</strong>
                      <span>{group.subtitle}</span>
                    </div>
                    <em>{group.countLabel}</em>
                  </button>
                  <div className="episode-group-body" aria-hidden={!groupOpen}>
                    {group.episodes.length ? (
                      <div className="episode-list">
                        {group.episodes.map((episode) => (
                          <button
                            key={episode.id}
                            className={`episode-row ${expandedEpisodeIds.has(episode.id) ? "expanded" : ""}`}
                            aria-expanded={expandedEpisodeIds.has(episode.id)}
                            onClick={() => toggleEpisodeOverview(episode.id)}
                          >
                            <DetailImage src={episode.imageUrl} className="episode-thumb" iconSize={15} />
                            <span className="episode-number">第 {episode.episodeNumber} 集</span>
                            <div className="episode-copy">
                              <strong>{episode.title || `第 ${episode.episodeNumber} 集`}</strong>
                              {episode.overview ? <p>{episode.overview}</p> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-episode-group">这一季暂无每集数据。</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="detail-section">
        <h3>备注</h3>
        <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} onBlur={() => onChange({ ...entry, notes: draftNotes })} />
      </section>

      {characters.length ? (
        <section className="detail-section">
          <h3>角色</h3>
          <div className="person-grid">
            {characters.map((character) => (
              <div key={`${character.id}-${character.characterName}`} className="person-row">
                <PersonImage src={character.profileUrl} className="person-avatar" />
                <div>
                  <strong>{character.characterName}</strong>
                  <span>{character.actorName}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {staffMembers.length ? (
        <section className="detail-section">
          <h3>制作人员</h3>
          <div className="person-grid">
            {staffMembers.map((staff) => (
              <div key={`${staff.id}-${staff.role}`} className="person-row">
                <PersonImage src={staff.profileUrl} className="person-avatar" />
                <div>
                  <strong>{staff.name}</strong>
                  <span>{staffRoleLabel(staff)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="detail-actions">
        <button className="secondary-button" onClick={() => onChange({ ...applyWatchStatus(entry, "watched"), dateFinished: dateInput(new Date().toISOString()) })}>
          <CheckCircle2 size={17} /> 标记看完
        </button>
        <button className="danger-button" onClick={() => onDelete(entry)}>
          <Trash2 size={17} /> 删除
        </button>
      </div>
    </aside>
  );
}

function WatchStatCard({
  className,
  icon,
  value,
  label,
}: {
  className: string;
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className={`watch-stat-card ${className}`}>
      <span className="watch-stat-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DetailMetricCard({
  className,
  icon,
  value,
  label,
}: {
  className: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className={`detail-metric-card ${className}`}>
      <span className="detail-metric-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function detailEpisodeCount(detail: AnimeDetail | null): number | null {
  return detail?.episodeCount ?? (detail?.episodes.length ? detail.episodes.length : null);
}

function detailRatingLabel(detail: AnimeDetail | null, entry: AnimeEntry): string {
  if (typeof detail?.voteAverage === "number") {
    return detail.voteAverage.toFixed(1);
  }
  return typeof entry.score === "number" ? `${entry.score}/5` : "暂无";
}

function detailRuntimeLabel(detail: AnimeDetail | null): string {
  return detail?.runtimeMinutes ? `${detail.runtimeMinutes} 分钟` : "未知";
}

interface EpisodeGroup {
  id: string;
  title: string;
  subtitle: string;
  countLabel: string;
  episodes: EpisodeWithProgress[];
}

function detailOverviewMetaLabel(detail: AnimeDetail | null): string | null {
  if (!detail) {
    return null;
  }
  const parts = [
    detail.status,
    typeof detail.voteAverage === "number" ? detail.voteAverage.toFixed(1) : null,
    typeof detail.episodeCount === "number" && detail.episodeCount > 0 ? `${detail.episodeCount} 集` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" / ") : null;
}

function buildEpisodeGroups(detail: AnimeDetail | null, episodes: EpisodeWithProgress[]): EpisodeGroup[] {
  const bySeason = new Map<number, EpisodeWithProgress[]>();
  episodes.forEach((episode) => {
    const seasonNumber = episode.seasonNumber ?? 1;
    bySeason.set(seasonNumber, [...(bySeason.get(seasonNumber) ?? []), episode]);
  });

  const groups: EpisodeGroup[] = [];
  detail?.seasons
    .slice()
    .sort((left, right) => left.seasonNumber - right.seasonNumber)
    .forEach((season) => {
      const seasonEpisodes = (bySeason.get(season.seasonNumber) ?? []).slice().sort(compareEpisodes);
      bySeason.delete(season.seasonNumber);
      const title = season.seasonNumber === 0 ? "特别篇" : season.title || `第 ${season.seasonNumber} 季`;
      const subtitle = season.seasonNumber === 0 ? "Specials" : `第 ${season.seasonNumber} 季`;
      const count = season.episodeCount ?? seasonEpisodes.length;
      groups.push({
        id: `season-${season.seasonNumber}`,
        title,
        subtitle,
        countLabel: count ? `${count} 集` : "",
        episodes: seasonEpisodes,
      });
    });

  [...bySeason.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([seasonNumber, seasonEpisodes]) => {
      const sortedEpisodes = seasonEpisodes.slice().sort(compareEpisodes);
      groups.push({
        id: `season-${seasonNumber}`,
        title: seasonNumber === 0 ? "特别篇" : `第 ${seasonNumber} 季`,
        subtitle: seasonNumber === 0 ? "Specials" : `第 ${seasonNumber} 季`,
        countLabel: `${sortedEpisodes.length} 集`,
        episodes: sortedEpisodes,
      });
    });

  if (!groups.length && episodes.length) {
    const sortedEpisodes = episodes.slice().sort(compareEpisodes);
    groups.push({
      id: "episodes",
      title: "集数",
      subtitle: "全部集数",
      countLabel: `${sortedEpisodes.length} 集`,
      episodes: sortedEpisodes,
    });
  }

  return groups;
}

function compareEpisodes(left: EpisodeWithProgress, right: EpisodeWithProgress): number {
  return left.episodeNumber - right.episodeNumber;
}

function SearchSheet({
  hasApiKey,
  initialLanguage,
  onClose,
  onAdd,
  onNeedApiKey,
}: {
  hasApiKey: boolean;
  initialLanguage: string;
  onClose: () => void;
  onAdd: (info: BasicInfo) => Promise<void>;
  onNeedApiKey: () => void;
}) {
  const [mode, setMode] = useState<"regular" | "batch">("regular");
  const [query, setQuery] = useState("Frieren");
  const [batchInput, setBatchInput] = useState("Frieren\nAkira\nDemon Slayer");
  const [language, setLanguage] = useState(initialLanguage);
  const [results, setResults] = useState<BasicInfo[]>([]);
  const [batchResults, setBatchResults] = useState<Array<{ prompt: string; result: BasicInfo | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!hasApiKey) {
      onNeedApiKey();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "regular") {
        setResults(await searchTmdb(query, language));
      } else {
        const prompts = parseBatchPrompts(batchInput);
        if (prompts.length === 0) {
          setBatchResults([]);
          return;
        }
        const resolved: Array<{ prompt: string; result: BasicInfo | null }> = [];
        for (const chunk of chunkBatchPrompts(prompts, 4)) {
          const chunkResults = await Promise.all(
            chunk.map(async (prompt) => {
              const promptResults = await searchTmdb(prompt, language);
              return { prompt, result: promptResults[0] ?? null };
            }),
          );
          resolved.push(...chunkResults);
        }
        setBatchResults(resolved);
      }
    } catch (searchError) {
      setError(String(searchError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="搜索 TMDb" onClose={onClose}>
      <div className="sheet-tabs">
        <button className={mode === "regular" ? "active" : ""} onClick={() => setMode("regular")}>
          单个
        </button>
        <button className={mode === "batch" ? "active" : ""} onClick={() => setMode("batch")}>
          批量
        </button>
      </div>
      <div className="search-row">
        {mode === "regular" ? (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="动漫标题" />
        ) : (
          <textarea
            className="batch-input"
            value={batchInput}
            onChange={(event) => setBatchInput(event.target.value)}
            placeholder="每行一个标题"
          />
        )}
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="zh-CN">中文</option>
          <option value="en-US">英文</option>
          <option value="ja-JP">日文</option>
        </select>
        <button className="primary-button" onClick={runSearch} disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Search size={18} />} 搜索
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {mode === "regular" ? (
        <div className="search-results">
          {results.map((result) => (
            <ResultRow key={`${result.mediaType}-${result.tmdbId}`} result={result} onAdd={onAdd} />
          ))}
        </div>
      ) : (
        <div className="search-results">
          {batchResults.length > 0 && (
            <button
              className="primary-button add-all-button"
              onClick={async () => {
                for (const item of batchResults) {
                  if (item.result) {
                    await onAdd(item.result);
                  }
                }
              }}
            >
              <Plus size={18} /> 添加全部结果
            </button>
          )}
          {batchResults.map((item) =>
            item.result ? (
              <ResultRow key={`${item.prompt}-${item.result.tmdbId}`} result={item.result} onAdd={onAdd} prompt={item.prompt} />
            ) : (
              <div key={item.prompt} className="result-row no-result">
                <div className="mini-poster" />
                <div>
                  <h3>{item.prompt}</h3>
                  <p>未找到 TMDb 结果。</p>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </Sheet>
  );
}

function ResultRow({
  result,
  prompt,
  onAdd,
}: {
  result: BasicInfo;
  prompt?: string;
  onAdd: (info: BasicInfo) => Promise<void>;
}) {
  const posterUrl = tmdbOriginalImageUrl(result.posterUrl);
  return (
    <button className="result-row" onClick={() => onAdd(result)}>
      {posterUrl ? <img src={posterUrl} alt="" loading="lazy" decoding="async" /> : <div className="mini-poster" />}
      <div>
        {prompt && <span className="prompt-label">{prompt}</span>}
        <h3>{result.name}</h3>
        <p>{mediaTypeLabel(result.mediaType as AnimeEntry["mediaType"])} / {result.onAirDate?.slice(0, 4) ?? "未知年份"}</p>
      </div>
      <Plus size={18} />
    </button>
  );
}

function SettingsSheet({
  hasApiKey,
  preferences,
  onPreferencesChange,
  onClose,
  onSave,
}: {
  hasApiKey: boolean;
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const updatePreference = <Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  return (
    <Sheet title="设置" onClose={onClose}>
      <div className="settings-grid">
        <section className="settings-section">
          <div className="settings-card">
            <KeyRound size={22} />
            <div>
              <h3>TMDb API Key</h3>
              <p>{hasApiKey ? "这台设备已保存 Key。" : "真实 TMDb 搜索需要 API Key。"}</p>
            </div>
          </div>
          <div className="api-key-row">
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="粘贴 TMDb API Key" />
            <button className="primary-button" onClick={() => onSave(apiKey)}>保存</button>
          </div>
        </section>

        <section className="settings-section">
          <SettingHeader icon={<Globe2 size={20} />} title="动漫信息语言" />
          <ToggleSetting
            title="跟随系统"
            checked={preferences.followSystemLanguage}
            onChange={(checked) => updatePreference("followSystemLanguage", checked)}
          />
          <label>
            <span>语言</span>
            <select
              value={preferences.preferredLanguage}
              disabled={preferences.followSystemLanguage}
              onChange={(event) => updatePreference("preferredLanguage", event.target.value)}
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">英文</option>
              <option value="ja-JP">日文</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <SettingHeader icon={<SlidersHorizontal size={20} />} title="库默认值" />
          <label>
            <span>新增条目状态</span>
            <select
              value={preferences.defaultNewEntryWatchStatus}
              onChange={(event) => updatePreference("defaultNewEntryWatchStatus", event.target.value as WatchStatus)}
            >
            {newEntryWatchStatuses.map((status) => (
                <option key={status} value={status}>
                  {watchStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>默认状态筛选</span>
            <select
              value={visibleStatusFilterValue(preferences.defaultStatusFilter)}
              onChange={(event) => updatePreference("defaultStatusFilter", event.target.value as WatchStatus | "all")}
            >
              <option value="all">全部</option>
              {visibleWatchStatuses.map((status) => (
                <option key={status} value={status}>
                  {watchStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <ToggleSetting
            title="默认只看收藏"
            checked={preferences.defaultFavoriteOnly}
            onChange={(checked) => updatePreference("defaultFavoriteOnly", checked)}
          />
          <ToggleSetting
            title="默认隐藏已放弃"
            checked={preferences.hideDroppedByDefault}
            onChange={(checked) => updatePreference("hideDroppedByDefault", checked)}
          />
          <ToggleSetting
            title="单击打开详情"
            checked={preferences.openDetailWithSingleTap}
            onChange={(checked) => updatePreference("openDetailWithSingleTap", checked)}
          />
        </section>

        <section className="settings-section">
          <SettingHeader icon={<Database size={20} />} title="追踪与显示" />
          <ToggleSetting
            title="启用评分"
            checked={preferences.scoringEnabled}
            onChange={(checked) => updatePreference("scoringEnabled", checked)}
          />
          <ToggleSetting
            title="显示海报进度条"
            checked={preferences.posterProgressBarOverlayEnabled}
            onChange={(checked) => updatePreference("posterProgressBarOverlayEnabled", checked)}
          />
          <ToggleSetting
            title="默认展开角色"
            checked={preferences.entryDetailCharactersExpandedByDefault}
            onChange={(checked) => updatePreference("entryDetailCharactersExpandedByDefault", checked)}
          />
          <ToggleSetting
            title="默认展开制作人员"
            checked={preferences.entryDetailStaffExpandedByDefault}
            onChange={(checked) => updatePreference("entryDetailStaffExpandedByDefault", checked)}
          />
          <ToggleSetting
            title="自动预取图片"
            checked={preferences.autoPrefetchImagesOnAddAndRestore}
            onChange={(checked) => updatePreference("autoPrefetchImagesOnAddAndRestore", checked)}
          />
        </section>

        <section className="settings-section">
          <SettingHeader icon={<RefreshCw size={20} />} title="TMDb 连接" />
          <ToggleSetting
            title="使用 TMDb 代理"
            checked={preferences.useTmdbRelayServer}
            onChange={(checked) => updatePreference("useTmdbRelayServer", checked)}
          />
        </section>

        <section className="settings-section about-settings-section">
          <SettingHeader icon={<Info size={20} />} title="关于 animelib" />
          <p>帮你记录管理动漫图书馆</p>
          <div className="about-meta-row">
            <span>版本号</span>
            <strong>{appVersion}</strong>
          </div>
          <button
            className="secondary-button github-home-button"
            type="button"
            onClick={() => window.open(animelibGithubUrl, "_blank", "noopener,noreferrer")}
          >
            <Github size={18} />
            github主页
            <ExternalLink size={16} />
          </button>
        </section>
      </div>
    </Sheet>
  );
}

function SettingHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="setting-header">
      <span>{icon}</span>
      <h3>{title}</h3>
    </div>
  );
}

function ToggleSetting({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-setting">
      <span>{title}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ProfileSheet({
  stats,
  onClose,
  onExport,
}: {
  stats: ReturnType<typeof deriveLibraryStats>;
  onClose: () => void;
  onExport: () => void;
}) {
  return (
    <Sheet title="库统计" onClose={onClose}>
      <section className="watch-stats-grid profile-watch-stats" aria-label="库统计">
        <WatchStatCard className="watched" icon={<CheckCircle2 size={18} />} value={stats.watched} label="已看完" />
        <WatchStatCard className="watching" icon={<Play size={18} fill="currentColor" />} value={stats.watching} label="在看" />
        <WatchStatCard className="favorite" icon={<Heart size={18} fill="currentColor" />} value={stats.favorites} label="收藏" />
        <WatchStatCard className="planned" icon={<Bookmark size={18} fill="currentColor" />} value={stats.planToWatch} label="想看" />
      </section>
      <button className="primary-button" onClick={onExport}>
        <Download size={18} /> 导出 JSON
      </button>
    </Sheet>
  );
}

function ExportSheet({
  onClose,
  onRestore,
}: {
  onClose: () => void;
  onRestore: (state: Awaited<ReturnType<typeof restoreBackup>>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [payload, setPayload] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    exportLibrary().then(setPayload).catch((error) => setPayload(String(error)));
  }, []);

  async function restoreFromJson(json: string) {
    const state = await restoreBackup(json);
    onRestore(state);
    setMessage("恢复完成。");
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    if (!isSupportedLibraryImportFile(file.name)) {
      setMessage("不支持的导入文件。");
      return;
    }
    try {
      await restoreFromJson(await file.text());
    } catch (error) {
      setMessage(String(error));
    }
  }

  return (
    <Sheet title="导出" onClose={onClose}>
      <textarea className="export-box" readOnly value={payload} />
      <section className="restore-panel">
        <h3>恢复备份</h3>
        <p>粘贴或导入 animelib 备份，也支持 iOS AniShelf Library JSON 导出。</p>
        <div className="restore-actions">
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={17} /> 导入文件
          </button>
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept=".json,.anishelf,application/json"
            onChange={handleImportFile}
          />
        </div>
        <textarea
          value={restoreInput}
          onChange={(event) => setRestoreInput(event.target.value)}
          placeholder="粘贴备份 JSON"
        />
        <button
          className="danger-button"
          onClick={async () => {
            try {
              await restoreFromJson(restoreInput);
            } catch (error) {
              setMessage(String(error));
            }
          }}
        >
          恢复
        </button>
        {message && <p className="restore-message">{message}</p>}
      </section>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function dateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function mergeCurrentPosterOption(entry: AnimeEntry | null, options: PosterOption[]): PosterOption[] {
  const currentPoster = tmdbOriginalImageUrl(entry?.posterUrl);
  if (!currentPoster || options.some((option) => tmdbOriginalImageUrl(option.url) === currentPoster)) {
    return options;
  }
  return [
    {
      id: "current-poster",
      url: currentPoster,
      previewUrl: currentPoster,
      source: "TMDb",
      language: "当前",
      voteAverage: null,
      width: null,
      height: null,
    },
    ...options,
  ];
}

function posterOptionLabel(option: PosterOption): string {
  const language = option.language ? option.language.toUpperCase() : "未标注";
  const score = typeof option.voteAverage === "number" && option.voteAverage > 0 ? ` / ${option.voteAverage.toFixed(1)}` : "";
  const resolution = option.width && option.height ? ` / ${option.width}x${option.height}` : "";
  return `${language}${score}${resolution}`;
}

function needsMetadataRefresh(entry: AnimeEntry): boolean {
  return (
    entry.tmdbId <= 0 ||
    !entry.overview?.trim() ||
    !entry.posterUrl?.trim()
  );
}

async function refreshEntryDetailWithRetry(
  entry: AnimeEntry,
  language: string,
  attempts = 2,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(refreshEntryDetail(entry, language), 25000);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await delay(1200);
      }
    }
  }
  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("TMDb 请求超时")), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

function staffRoleLabel(staff: StaffSummary): string {
  const jobs = staff.jobs.map((job) => job.job).filter(Boolean);
  if (jobs.length > 0) {
    return jobs.join("、");
  }
  return staff.role || staff.department || "制作人员";
}

function viewStyleLabel(style: LibraryViewStyle): string {
  switch (style) {
    case "gallery":
      return "画廊";
    case "list":
      return "列表";
    case "grid":
      return "网格";
  }
}

function sortLabel(sort: LibrarySort): string {
  switch (sort) {
    case "title":
      return "标题";
    case "releaseDate":
      return "播出";
    case "score":
      return "评分";
    case "dateSaved":
      return "保存";
  }
}

function preferenceBaseFromPreferences(preferences: AppPreferences): PreferenceBase {
  const { libraryViewStyle: _libraryViewStyle, sort: _sort, sortReversed: _sortReversed, ...base } = preferences;
  return {
    ...base,
    defaultNewEntryWatchStatus: visibleNewEntryStatusValue(base.defaultNewEntryWatchStatus),
    defaultStatusFilter: visibleStatusFilterValue(base.defaultStatusFilter),
  };
}
