import { describe, expect, it } from "vitest";
import { announcementIsCurrent } from "@/lib/announcements";

describe("staff announcements", () => {
  const now = new Date("2026-10-26T22:00:00Z");
  it("shows a published active announcement to staff", () => {
    expect(announcementIsCurrent({ active: true, starts_at: "2026-10-26T21:00:00Z", ends_at: null }, now)).toBe(true);
  });
  it("does not show stopped announcements", () => {
    expect(announcementIsCurrent({ active: false, starts_at: "2026-10-26T21:00:00Z", ends_at: null }, now)).toBe(false);
  });
  it("does not show future or expired announcements", () => {
    expect(announcementIsCurrent({ active: true, starts_at: "2026-10-27T21:00:00Z", ends_at: null }, now)).toBe(false);
    expect(announcementIsCurrent({ active: true, starts_at: "2026-10-26T21:00:00Z", ends_at: "2026-10-26T22:00:00Z" }, now)).toBe(false);
  });
});