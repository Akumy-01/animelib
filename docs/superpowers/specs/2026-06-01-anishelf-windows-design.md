# AniShelf Windows Design

## Goal

Build a Windows desktop version of AniShelf that faithfully recreates the iOS app's library-first experience while using a Tauri desktop architecture that feels reliable on Windows.

## Decisions

- Platform: Tauri v2 desktop application.
- Interface: React + TypeScript.
- Local core: Rust commands for TMDb access, local persistence, backup/export, image cache, and API key handling.
- Persistence: SQLite in the application data directory.
- Visual direction: faithful iOS-style AniShelf interface rather than a Windows-native redesign.
- Data source: real TMDb API from the first usable version. The user provides a TMDb API key.
- Scope: high-fidelity staged recreation, including library views, TMDb search, series/season selection, detail tracking, batch search, profile/statistics, export/backup, and sharing card support.

## Architecture

The app uses a split boundary:

- React renders the library, search, entry detail, settings, and sharing UI.
- Rust owns side effects and local resources through Tauri commands.
- SQLite stores entries, details, episode progress, preferences, and cached metadata.
- The filesystem stores cached poster/backdrop assets and backup/export artifacts.

The initial command surface includes:

- `get_app_state`
- `save_api_key`
- `search_tmdb`
- `fetch_tmdb_detail`
- `add_entry`
- `update_entry`
- `delete_entry`
- `export_library`
- `create_backup`
- `restore_backup`

## Data Model

`AnimeEntry` mirrors the current iOS model:

- `id`
- `tmdb_id`
- `media_type`: `movie`, `series`, or `season`
- `season_number`
- `parent_series_id`
- `name`
- `name_translations`
- `overview`
- `overview_translations`
- `poster_url`
- `backdrop_url`
- `details_url`
- `original_language_code`
- `watch_status`: `planToWatch`, `watching`, `watched`, `dropped`
- `date_saved`
- `date_started`
- `date_finished`
- `is_date_tracking_enabled`
- `score`
- `favorite`
- `notes`
- `using_custom_poster`

`AnimeDetail` stores TMDb detail data:

- language
- title
- subtitle
- overview
- status
- air date
- primary link
- hero image
- logo image
- genre IDs
- vote average
- runtime
- episode count
- season count
- characters
- staff
- seasons
- episodes

`EpisodeProgress` stores per-entry episode state so the Windows version can support more granular tracking later.

`Preference` stores view style, scoring toggle, preferred info language, theme, TMDb proxy mode, filters, and sorting.

## User Experience

The main screen follows the iOS AniShelf structure:

- Gallery, list, and grid views.
- A compact top title/status capsule.
- Bottom toolbar controls for view style, filter summary, and search.
- Profile/settings sheet.
- Search sheet for regular and batch TMDb search.
- Detail view with poster/backdrop header, tracking controls, metadata, notes, cast/staff, seasons, and episodes.

Windows-specific affordances supplement the iOS flow:

- Right-click context menus for entries.
- Keyboard shortcuts for search, view switching, refresh, export, and settings.
- Native file pickers for import/export/backup.
- Responsive resizing while keeping stable card dimensions.

## TMDb Integration

Rust performs TMDb requests with the user's API key:

- search movies and TV series in parallel;
- filter results to animation genre where TMDb genre IDs are available;
- fetch movie, series, season, episode, credits, and image configuration details;
- normalize TMDb responses into app DTOs;
- cache image configuration in memory;
- cache poster/backdrop images on disk where feasible.

Network failures produce typed errors. The UI distinguishes invalid API key, no results, timeout, rate limiting, partial image failures, and generic network errors.

## Backup And Export

The Windows version supports two levels:

- Human-readable export: JSON, CSV, TSV, and XLSX-style spreadsheet output.
- Full app backup: a `.anishelf` archive containing database data, preferences, and cache metadata.

The first Windows archive format is JSON-based rather than a raw SwiftData backup. Later importers can read selected iOS export formats when their stable interchange shape is known.

## Testing Strategy

Development follows TDD for behavior:

- Rust unit tests cover model mapping, repository operations, filtering, backup payloads, and TMDb client URL/request construction.
- React tests cover reducers/selectors, filtering, sorting, and important UI state transitions.
- Tauri command integration tests cover local app-state commands where possible.
- Browser smoke checks verify that the library, search, detail, and settings views render without layout overlap.

## Implementation Phases

1. Project foundation: Tauri, React, TypeScript, Rust modules, tests, and build scripts.
2. Local library: SQLite schema, repository, commands, seeded state, library UI.
3. TMDb onboarding and search: API key flow, search command, results UI, add-entry flow.
4. Detail tracking: detail view, status, score, dates, notes, episodes, refresh.
5. High-fidelity library polish: gallery/list/grid, filters, sorting, grouping, multi-select.
6. Utilities: profile stats, import/export, backup/restore, image cache, sharing card.

## Risks And Guardrails

- TMDb may be slow or blocked in some network environments, so local data must stay usable offline.
- High-fidelity visual recreation must not rely on fixed mobile dimensions; card sizes and text wrapping must remain stable on Windows.
- The first Windows archive format must not pretend to be binary-compatible with SwiftData backups.
- API keys must not be written into project files, logs, or exported library files.
