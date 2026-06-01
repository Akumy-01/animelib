import { describe, expect, it } from "vitest";
import { deriveLibraryStats, filterEntries, sortEntries, updateEntryInList } from "./library";

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
