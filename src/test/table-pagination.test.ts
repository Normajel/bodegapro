import { describe, it, expect } from "vitest";
import { fetchAllTableRows, pageWindow } from "@/lib/table-pagination";
describe("table pagination", () => {
  it("shows 10 rows and advances without skipping or repeating rows", () => {
    const rows = Array.from({ length: 23 }, (_, id) => id);
    const pages = [0, 1, 2].map((p) => {
      const w = pageWindow(rows.length, 10, p);
      return rows.slice(w.start, w.end);
    });
    expect(pages.map((p) => p.length)).toEqual([10, 10, 3]);
    expect(pages.flat()).toEqual(rows);
  });
  it("supports 20 rows per page", () => {
    expect(pageWindow(41, 20, 1)).toMatchObject({
      page: 1,
      pageCount: 3,
      start: 20,
      end: 40,
      first: 21,
      last: 40,
    });
  });
  it("clamps an old page after records are filtered or removed", () => {
    expect(pageWindow(3, 10, 6)).toMatchObject({ page: 0, start: 0, end: 3 });
  });
  it("handles empty results and exact page boundaries", () => {
    expect(pageWindow(0, 10, 3)).toMatchObject({ page: 0, pageCount: 1, first: 0, last: 0 });
    expect(pageWindow(20, 10, 3)).toMatchObject({ page: 1, pageCount: 2, first: 11, last: 20 });
  });
  it("loads the complete source beyond server page boundaries before document grouping", async () => {
    const rows = Array.from({ length: 2005 }, (_, id) => ({
      id,
      document: id === 999 || id === 1000 ? "same-document" : String(id),
    }));
    const calls: number[][] = [];
    const result = await fetchAllTableRows(async (start, end) => {
      calls.push([start, end]);
      return { data: rows.slice(start, end + 1), error: null };
    });
    expect(result).toEqual(rows);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(result.filter((r) => r.document === "same-document")).toHaveLength(2);
  });
  it("rejects fetch errors instead of presenting an incomplete history as complete", async () => {
    let page = 0;
    await expect(
      fetchAllTableRows(async () =>
        ++page === 1
          ? { data: Array.from({ length: 1000 }, (_, id) => id), error: null }
          : { data: null, error: new Error("network") },
      ),
    ).rejects.toThrow("network");
  });
});
