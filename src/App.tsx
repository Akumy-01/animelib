import {
  Calendar,
  CheckCircle2,
  Download,
  Film,
  Grid2X2,
  Heart,
  Images,
  KeyRound,
  List,
  Loader2,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  addEntry,
  deleteEntry,
  exportLibrary,
  getAppState,
  saveApiKey,
  searchTmdb,
  updateEntry,
} from "./api";
import {
  deriveLibraryStats,
  filterEntries,
  mediaTypeLabel,
  sortEntries,
  updateEntryInList,
  watchStatusLabel,
} from "./library";
import type { AnimeEntry, BasicInfo, LibraryFilters, LibrarySort, LibraryViewStyle, WatchStatus } from "./types";

type Sheet = "search" | "settings" | "profile" | "export" | null;

const watchStatuses: WatchStatus[] = ["planToWatch", "watching", "watched", "dropped"];
const viewStyles: LibraryViewStyle[] = ["gallery", "list", "grid"];
const sortOptions: LibrarySort[] = ["dateSaved", "title", "releaseDate", "score"];

export function App() {
  const [entries, setEntries] = useState<AnimeEntry[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewStyle, setViewStyle] = useState<LibraryViewStyle>("gallery");
  const [sort, setSort] = useState<LibrarySort>("dateSaved");
  const [sortReversed, setSortReversed] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>({ status: "all" });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getAppState()
      .then((state) => {
        setEntries(state.entries);
        setHasApiKey(state.hasApiKey);
        setViewStyle(state.preferences.libraryViewStyle);
        setSort(state.preferences.sort);
        setSortReversed(state.preferences.sortReversed);
        setSelectedId(state.entries[0]?.id ?? null);
        if (!state.hasApiKey) {
          setSheet("settings");
        }
      })
      .catch((error) => setToast(String(error)))
      .finally(() => setLoading(false));
  }, []);

  const visibleEntries = useMemo(
    () => sortEntries(filterEntries(entries, filters), sort, sortReversed),
    [entries, filters, sort, sortReversed],
  );
  const stats = useMemo(() => deriveLibraryStats(entries), [entries]);
  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? entries[0] ?? null;

  async function persistEntry(entry: AnimeEntry) {
    const saved = await updateEntry(entry);
    setEntries((current) => updateEntryInList(current, saved));
    setSelectedId(saved.id);
  }

  async function removeEntry(entry: AnimeEntry) {
    const state = await deleteEntry(entry.id);
    setEntries(state.entries);
    setSelectedId(state.entries[0]?.id ?? null);
  }

  return (
    <main className="app-shell">
      <section className="library-stage">
        <header className="topbar">
          <button className="text-button">Select</button>
          <button className="title-capsule" onClick={() => setSheet("profile")}>
            <span>AniShelf</span>
            <strong>{visibleEntries.length}</strong>
          </button>
          <button className="icon-button" aria-label="Settings" onClick={() => setSheet("settings")}>
            <Settings size={20} />
          </button>
        </header>

        <section className="content-grid">
          <section className={`library-panel ${viewStyle}`}>
            {loading ? (
              <div className="center-state">
                <Loader2 className="spin" />
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="center-state">
                <Images size={36} />
                <h2>No anime yet</h2>
                <button className="primary-button" onClick={() => setSheet("search")}>
                  <Plus size={18} /> Add anime
                </button>
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedEntry?.id}
                  viewStyle={viewStyle}
                  onClick={() => setSelectedId(entry.id)}
                />
              ))
            )}
          </section>

          <DetailPanel entry={selectedEntry} onChange={persistEntry} onDelete={removeEntry} />
        </section>

        <footer className="bottom-bar">
          <div className="segmented">
            {viewStyles.map((style) => (
              <button
                key={style}
                className={style === viewStyle ? "active" : ""}
                onClick={() => setViewStyle(style)}
                title={style}
              >
                {style === "gallery" ? <Images size={18} /> : style === "list" ? <List size={18} /> : <Grid2X2 size={18} />}
              </button>
            ))}
          </div>

          <button className="filter-pill" onClick={() => setFilters({ ...filters, favoriteOnly: !filters.favoriteOnly })}>
            <Heart size={16} fill={filters.favoriteOnly ? "currentColor" : "none"} />
            {filters.favoriteOnly ? "Favorites" : "All"}
          </button>

          <select value={filters.status ?? "all"} onChange={(event) => setFilters({ ...filters, status: event.target.value as WatchStatus | "all" })}>
            <option value="all">All Status</option>
            {watchStatuses.map((status) => (
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

          <button className="icon-button" aria-label="Reverse sort" onClick={() => setSortReversed(!sortReversed)}>
            {sortReversed ? "↑" : "↓"}
          </button>

          <button className="primary-button" onClick={() => setSheet("search")}>
            <Search size={18} /> Search
          </button>
        </footer>
      </section>

      {sheet === "search" && (
        <SearchSheet
          hasApiKey={hasApiKey}
          onClose={() => setSheet(null)}
          onAdd={async (info) => {
            const entry = await addEntry(info);
            setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
            setSelectedId(entry.id);
            setToast("Added to library");
          }}
          onNeedApiKey={() => setSheet("settings")}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          hasApiKey={hasApiKey}
          onClose={() => setSheet(null)}
          onSave={async (apiKey) => {
            const state = await saveApiKey(apiKey);
            setHasApiKey(state.hasApiKey);
            setToast("TMDb API key saved");
          }}
        />
      )}
      {sheet === "profile" && <ProfileSheet stats={stats} onExport={() => setSheet("export")} onClose={() => setSheet(null)} />}
      {sheet === "export" && <ExportSheet onClose={() => setSheet(null)} />}

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
  viewStyle,
  onClick,
}: {
  entry: AnimeEntry;
  selected: boolean;
  viewStyle: LibraryViewStyle;
  onClick: () => void;
}) {
  return (
    <button className={`entry-card ${viewStyle} ${selected ? "selected" : ""}`} onClick={onClick}>
      <Poster entry={entry} />
      <div className="entry-copy">
        <div className="entry-title-row">
          <h3>{entry.name}</h3>
          {entry.favorite && <Heart size={15} fill="currentColor" />}
        </div>
        <p>{mediaTypeLabel(entry.mediaType)} · {entry.onAirDate?.slice(0, 4) ?? "Unknown"}</p>
        <span>{watchStatusLabel(entry.watchStatus)}</span>
      </div>
    </button>
  );
}

function Poster({ entry }: { entry: AnimeEntry }) {
  if (entry.posterUrl) {
    return <img className="poster" src={entry.posterUrl} alt="" />;
  }
  return (
    <div className="poster poster-fallback">
      <Film size={28} />
    </div>
  );
}

function DetailPanel({
  entry,
  onChange,
  onDelete,
}: {
  entry: AnimeEntry | null;
  onChange: (entry: AnimeEntry) => Promise<void>;
  onDelete: (entry: AnimeEntry) => Promise<void>;
}) {
  const [draftNotes, setDraftNotes] = useState(entry?.notes ?? "");

  useEffect(() => {
    setDraftNotes(entry?.notes ?? "");
  }, [entry?.id, entry?.notes]);

  if (!entry) {
    return (
      <aside className="detail-panel empty-detail">
        <Film size={34} />
        <h2>Select an entry</h2>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <div className="hero" style={{ backgroundImage: entry.backdropUrl ? `url(${entry.backdropUrl})` : undefined }}>
        <div>
          <span>{mediaTypeLabel(entry.mediaType)}</span>
          <h2>{entry.name}</h2>
        </div>
        <button
          className="icon-button glass"
          onClick={() => onChange({ ...entry, favorite: !entry.favorite })}
          aria-label="Favorite"
        >
          <Heart size={18} fill={entry.favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="tracking-grid">
        <label>
          <span>Status</span>
          <select value={entry.watchStatus} onChange={(event) => onChange({ ...entry, watchStatus: event.target.value as WatchStatus })}>
            {watchStatuses.map((status) => (
              <option key={status} value={status}>
                {watchStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Score</span>
          <select value={entry.score ?? ""} onChange={(event) => onChange({ ...entry, score: event.target.value ? Number(event.target.value) : null })}>
            <option value="">No score</option>
            {[1, 2, 3, 4, 5].map((score) => (
              <option key={score} value={score}>
                {score}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Started</span>
          <input type="date" value={dateInput(entry.dateStarted)} onChange={(event) => onChange({ ...entry, dateStarted: event.target.value || null })} />
        </label>
        <label>
          <span>Finished</span>
          <input type="date" value={dateInput(entry.dateFinished)} onChange={(event) => onChange({ ...entry, dateFinished: event.target.value || null })} />
        </label>
      </div>

      <section className="detail-section">
        <h3>Overview</h3>
        <p>{entry.overview || "No overview available."}</p>
      </section>

      <section className="detail-section">
        <h3>Notes</h3>
        <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} onBlur={() => onChange({ ...entry, notes: draftNotes })} />
      </section>

      <div className="detail-actions">
        <button className="secondary-button" onClick={() => onChange({ ...entry, watchStatus: "watched", dateFinished: dateInput(new Date().toISOString()) })}>
          <CheckCircle2 size={17} /> Mark watched
        </button>
        <button className="danger-button" onClick={() => onDelete(entry)}>
          <Trash2 size={17} /> Delete
        </button>
      </div>
    </aside>
  );
}

function SearchSheet({
  hasApiKey,
  onClose,
  onAdd,
  onNeedApiKey,
}: {
  hasApiKey: boolean;
  onClose: () => void;
  onAdd: (info: BasicInfo) => Promise<void>;
  onNeedApiKey: () => void;
}) {
  const [query, setQuery] = useState("Frieren");
  const [language, setLanguage] = useState("zh-CN");
  const [results, setResults] = useState<BasicInfo[]>([]);
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
      setResults(await searchTmdb(query, language));
    } catch (searchError) {
      setError(String(searchError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Search TMDb" onClose={onClose}>
      <div className="search-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anime title" />
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="zh-CN">Chinese</option>
          <option value="en-US">English</option>
          <option value="ja-JP">Japanese</option>
        </select>
        <button className="primary-button" onClick={runSearch} disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Search size={18} />} Search
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="search-results">
        {results.map((result) => (
          <button key={`${result.mediaType}-${result.tmdbId}`} className="result-row" onClick={() => onAdd(result)}>
            {result.posterUrl ? <img src={result.posterUrl} alt="" /> : <div className="mini-poster" />}
            <div>
              <h3>{result.name}</h3>
              <p>{mediaTypeLabel(result.mediaType as AnimeEntry["mediaType"])} · {result.onAirDate?.slice(0, 4) ?? "Unknown"}</p>
            </div>
            <Plus size={18} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function SettingsSheet({
  hasApiKey,
  onClose,
  onSave,
}: {
  hasApiKey: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="settings-card">
        <KeyRound size={22} />
        <div>
          <h3>TMDb API Key</h3>
          <p>{hasApiKey ? "A key is saved for this device." : "A key is required for real TMDb search."}</p>
        </div>
      </div>
      <div className="api-key-row">
        <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="Paste TMDb API key" />
        <button className="primary-button" onClick={() => onSave(apiKey)}>Save</button>
      </div>
    </Sheet>
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
    <Sheet title="Library Profile" onClose={onClose}>
      <div className="stats-grid">
        <Stat label="Total" value={stats.total} />
        <Stat label="Watching" value={stats.watching} />
        <Stat label="Watched" value={stats.watched} />
        <Stat label="Favorites" value={stats.favorites} />
        <Stat label="Average" value={stats.averageScore?.toFixed(1) ?? "-"} />
      </div>
      <button className="primary-button" onClick={onExport}>
        <Download size={18} /> Export Library
      </button>
    </Sheet>
  );
}

function ExportSheet({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState("");
  useEffect(() => {
    exportLibrary().then(setPayload).catch((error) => setPayload(String(error)));
  }, []);
  return (
    <Sheet title="Export" onClose={onClose}>
      <textarea className="export-box" readOnly value={payload} />
    </Sheet>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="sheet">
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function dateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function sortLabel(sort: LibrarySort): string {
  switch (sort) {
    case "title":
      return "Title";
    case "releaseDate":
      return "Release";
    case "score":
      return "Score";
    case "dateSaved":
      return "Saved";
  }
}
