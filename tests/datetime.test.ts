import { describe, it, expect } from "vitest";
import { pad, toLocalInput, fmtDT } from "@/lib/datetime";

describe("datetime helpers", () => {
  it("pad zero-pads to two digits", () => {
    expect(pad(3)).toBe("03");
    expect(pad(12)).toBe("12");
  });
  it("toLocalInput round-trips a local Date to the datetime-local format", () => {
    const d = new Date(2026, 8, 25, 14, 5); // local Sep 25 2026, 14:05
    expect(toLocalInput(d.toISOString())).toBe("2026-09-25T14:05");
  });
  it("toLocalInput returns '' for null/invalid input", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not-a-date")).toBe("");
  });
  it("fmtDT formats as M/D(曜) HH:MM in local time", () => {
    const d = new Date(2026, 8, 25, 9, 3); // local
    expect(fmtDT(d.toISOString())).toMatch(/^9\/25\(.\) 09:03$/);
  });
});
