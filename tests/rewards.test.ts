import { describe, it, expect } from "vitest";
import { rewardProgress } from "@/lib/rewards";

const t = (s: string) => new Date(s).getTime();
const created = "2026-09-25T00:00:00Z";

describe("rewardProgress — counts only stamps at/after the reward's created_at", () => {
  it("ignores stamps earned before creation", () => {
    const stamps = [t("2026-09-24T10:00:00Z"), t("2026-09-25T09:00:00Z"), t("2026-09-26T09:00:00Z")];
    expect(rewardProgress(stamps, created, 5).progress).toBe(2);
  });
  it("a stamp exactly at created_at counts (>=)", () => {
    expect(rewardProgress([t(created)], created, 1).progress).toBe(1);
  });
  it("unlocks when progress reaches the required number", () => {
    const stamps = [t("2026-09-26"), t("2026-09-26"), t("2026-09-26")];
    expect(rewardProgress(stamps, created, 3).unlocked).toBe(true);
    expect(rewardProgress(stamps, created, 4).unlocked).toBe(false);
  });
  it("no stamps → 0 and locked", () => {
    expect(rewardProgress([], created, 1)).toEqual({ progress: 0, unlocked: false });
  });
  it("all stamps before creation → 0 (the key spec)", () => {
    expect(rewardProgress([t("2020-01-01"), t("2019-01-01")], created, 1).progress).toBe(0);
  });
});
