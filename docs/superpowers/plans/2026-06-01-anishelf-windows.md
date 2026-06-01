# AniShelf Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Tauri + React Windows version of AniShelf with Rust-owned local state, TMDb search, library tracking, export, and high-fidelity iOS-inspired UI.

**Architecture:** React/TypeScript renders the app and calls Rust through Tauri commands. Rust owns models, SQLite persistence, TMDb HTTP requests, import/export payloads, and backup archives. The first vertical slice implements the complete app shell, local library, TMDb search/add flow, detail editing, filtering/sorting, and export hooks.

**Tech Stack:** Tauri v2, React 18, TypeScript, Vite, Vitest, Rust 2021, rusqlite, reqwest, serde, chrono.

---

### Task 1: Project Foundation

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing smoke test**

```ts
import { describe, expect, it } from "vitest";
import { sortEntries } from "./library";

describe("sortEntries", () => {
  it("sorts entries by saved date descending by default", () => {
    const result = sortEntries([
      { id: "1", name: "Old", dateSaved: "2026-01-01T00:00:00Z" },
      { id: "2", name: "New", dateSaved: "2026-02-01T00:00:00Z" },
    ] as any);

    expect(result.map((entry) => entry.name)).toEqual(["New", "Old"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/library.test.ts`
Expected: FAIL because `src/library.ts` does not exist.

- [ ] **Step 3: Add project files and minimal library helper**

Create the Vite/Tauri project files, define a small `sortEntries` helper, and render the React root.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/library.test.ts`
Expected: PASS.

### Task 2: Rust Models And Repository

**Files:**
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/repository.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests**

```rust
#[test]
fn creates_default_entry_from_basic_info() {
    let info = BasicInfo {
        tmdb_id: 42,
        media_type: MediaType::Movie,
        name: "Akira".into(),
        overview: Some("Neo Tokyo".into()),
        poster_url: None,
        backdrop_url: None,
        on_air_date: Some("1988-07-16".into()),
    };

    let entry = AnimeEntry::from_basic_info(info);

    assert_eq!(entry.watch_status, WatchStatus::PlanToWatch);
    assert_eq!(entry.score, None);
    assert_eq!(entry.favorite, false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml creates_default_entry_from_basic_info`
Expected: FAIL because models are not implemented.

- [ ] **Step 3: Implement Rust models, SQLite schema, and repository methods**

Define `AnimeEntry`, `BasicInfo`, `MediaType`, `WatchStatus`, `LibraryFilter`, `LibrarySort`, `AppStatePayload`, and repository methods for init, list, insert, update, delete, and export.

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

### Task 3: Tauri Commands And TMDb Client

**Files:**
- Create: `src-tauri/src/tmdb.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing TMDb URL/filter tests**

```rust
#[test]
fn tmdb_search_url_encodes_query_and_language() {
    let url = build_search_url("Frieren Beyond Journey", "zh-CN", 1);
    assert!(url.contains("Frieren%20Beyond%20Journey"));
    assert!(url.contains("language=zh-CN"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tmdb_search_url_encodes_query_and_language`
Expected: FAIL because TMDb module is missing.

- [ ] **Step 3: Implement commands**

Implement `get_app_state`, `save_api_key`, `search_tmdb`, `add_entry`, `update_entry`, `delete_entry`, and `export_library`. Store API key in local app settings for the first slice and keep it out of exports.

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

### Task 4: React App Shell And Library UI

**Files:**
- Create: `src/types.ts`
- Create: `src/api.ts`
- Create: `src/library.ts`
- Create: `src/library.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing TypeScript tests for filtering and updates**

```ts
import { describe, expect, it } from "vitest";
import { filterEntries, updateEntryInList } from "./library";

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
    const entries = [{ id: "1", name: "A" }, { id: "2", name: "B" }] as any;
    const updated = updateEntryInList(entries, { id: "2", name: "C" } as any);
    expect(updated.map((entry) => entry.name)).toEqual(["A", "C"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/library.test.ts`
Expected: FAIL until helper functions exist.

- [ ] **Step 3: Implement UI**

Build onboarding, library gallery/list/grid, search sheet, detail panel, tracking controls, filters, sorting, and export buttons. Use stable responsive dimensions and iOS-like visual styling.

- [ ] **Step 4: Run TypeScript tests**

Run: `npm test -- src/library.test.ts`
Expected: PASS.

### Task 5: Verification And Local Run

**Files:**
- Modify: none unless verification reveals defects.

- [ ] **Step 1: Run full frontend test suite**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `npm run build`
Expected: PASS and produce `dist/`.

- [ ] **Step 4: Run Tauri build check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Start development server**

Run: `npm run dev -- --host 127.0.0.1`
Expected: Vite serves the app locally for browser inspection.
