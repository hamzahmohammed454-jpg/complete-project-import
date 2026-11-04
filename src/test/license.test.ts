import { describe, expect, it } from "vitest";
import { licenseAllowsWrites, trialEnd } from "@/lib/license";
describe("owner trial rules", () => {
  it("runs for one calendar month, not an invented number of days", () => {
    expect(trialEnd("2026-10-27T11:21:00Z")).toBe("2026-11-27T11:21:00.000Z");
    expect(trialEnd("2026-01-31T11:21:00Z")).toBe("2026-02-28T11:21:00.000Z");
  });
  it("blocks recording at expiry and allows recording before expiry", () => {
    const status = { activated: false, licensed_until: null, trial_ends_at: "2026-11-27T11:21:00Z" };
    expect(licenseAllowsWrites(status, "2026-11-27T11:20:59Z")).toBe(true);
    expect(licenseAllowsWrites(status, "2026-11-27T11:21:00Z")).toBe(false);
  });
  it("accepts an activated permanent license and expires a dated license", () => {
    expect(licenseAllowsWrites({ activated: true, licensed_until: null, trial_ends_at: "2026-01-01" }, "2027-01-01")).toBe(true);
    expect(licenseAllowsWrites({ activated: true, licensed_until: "2026-12-01", trial_ends_at: "2026-01-01" }, "2027-01-01")).toBe(false);
  });
});