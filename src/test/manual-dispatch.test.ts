import { describe, it, expect } from "vitest";
import { manualDispatchTimestamp, santiagoLocalDateTime } from "@/lib/manual-dispatch";
describe("manual dispatch Chile date and time", () => {
  it("converts summer dates using Chile time", () =>
    expect(manualDispatchTimestamp("2026-11-01T20:15")).toBe("2026-11-01T23:15:00.000Z"));
  it("converts winter dates using Chile time", () =>
    expect(manualDispatchTimestamp("2026-07-01T20:15")).toBe("2026-07-02T00:15:00.000Z"));
  it("round trips the local date without using the device timezone", () =>
    expect(santiagoLocalDateTime(new Date("2026-11-01T23:15:00Z"))).toBe("2026-11-01T20:15"));
  it("rejects invalid dates and times", () => {
    for (const value of ["2026-02-30T12:00", "2026-11-01T24:00", "2026-11-01T20:70", ""])
      expect(() => manualDispatchTimestamp(value)).toThrow();
  });
});
