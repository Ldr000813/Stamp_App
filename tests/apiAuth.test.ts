import { describe, it, expect, afterEach } from "vitest";
import { isAdminEmail, canManageSpotDecision } from "@/lib/apiAuth";

const ORIG = process.env.ADMIN_EMAILS;
afterEach(() => { process.env.ADMIN_EMAILS = ORIG; });

describe("isAdminEmail", () => {
  it("matches the allowlist case-insensitively and trims spaces", () => {
    process.env.ADMIN_EMAILS = "admin@x.com,  Boss@Y.com ";
    expect(isAdminEmail("admin@x.com")).toBe(true);
    expect(isAdminEmail("BOSS@y.com")).toBe(true);
    expect(isAdminEmail("stranger@x.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
  it("empty allowlist → nobody is admin", () => {
    process.env.ADMIN_EMAILS = "";
    expect(isAdminEmail("admin@x.com")).toBe(false);
  });
});

describe("canManageSpotDecision — permission separation", () => {
  it("admin can manage any spot", () => {
    expect(canManageSpotDecision("a@x.com", null, true)).toBe(true);
    expect(canManageSpotDecision(null, "owner@x.com", true)).toBe(true);
  });
  it("owner can manage only their own spot (case-insensitive)", () => {
    expect(canManageSpotDecision("owner@x.com", "Owner@X.com", false)).toBe(true);
  });
  it("a different user cannot manage someone else's spot", () => {
    expect(canManageSpotDecision("other@x.com", "owner@x.com", false)).toBe(false);
  });
  it("a spot with no owner cannot be managed by a non-admin", () => {
    expect(canManageSpotDecision("owner@x.com", null, false)).toBe(false);
    expect(canManageSpotDecision("owner@x.com", undefined, false)).toBe(false);
  });
  it("no logged-in email → cannot manage", () => {
    expect(canManageSpotDecision(null, "owner@x.com", false)).toBe(false);
  });
});
