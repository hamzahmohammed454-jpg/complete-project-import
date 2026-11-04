import { describe, expect, it } from "vitest";
import { assignmentAllows, defaultBoxId, defaultCurrencyId } from "@/lib/staff-defaults";

describe("Staff work defaults", () => {
  it("prefers the user assigned box over the device remembered box", () => {
    expect(defaultBoxId(2, "1", [{ id: 1 }, { id: 2 }])).toBe("2");
  });
  it("uses the assigned currency only when it exists", () => {
    expect(defaultCurrencyId(3, [{ id: 3 }, { id: 4 }])).toBe("3");
    expect(defaultCurrencyId(9, [{ id: 3 }])).toBe("");
  });
  it("does not invent a default when no assignment or remembered box exists", () => {
    expect(defaultBoxId(null, null, [{ id: 1 }, { id: 2 }])).toBe("");
  });
});
describe("Mandatory manager assignments", () => {
 it("allows alternatives when manager chooses optional", () => { expect(assignmentAllows({ box_id: 2, currency_id: 3, branch_id: null, enforce_box: false, enforce_currency: false }, 9, 8)).toBe(true); });
 it("rejects another box when manager makes the box mandatory", () => { expect(assignmentAllows({ box_id: 2, currency_id: 3, branch_id: null, enforce_box: true }, 9, 3)).toBe(false); });
 it("rejects another currency when manager makes currency mandatory", () => { expect(assignmentAllows({ box_id: 2, currency_id: 3, branch_id: null, enforce_currency: true }, 2, 8)).toBe(false); });
 it("allows the exact mandatory assignments", () => { expect(assignmentAllows({ box_id: 2, currency_id: 3, branch_id: null, enforce_box: true, enforce_currency: true }, 2, 3)).toBe(true); });
});
import { dateAllowed } from "@/lib/staff-defaults";
import { tradeAllowed } from "@/lib/staff-defaults";
describe("staff trade permission", () => {
  it("blocks purchase independently from sale", () => {
    expect(tradeAllowed({ allow_buy: false, allow_sell: true }, "buy", false)).toBe(false);
    expect(tradeAllowed({ allow_buy: false, allow_sell: true }, "sell", false)).toBe(true);
  });
  it("blocks sale independently from purchase", () => {
    expect(tradeAllowed({ allow_buy: true, allow_sell: false }, "sell", false)).toBe(false);
  });
  it("preserves administrator access", () => {
    expect(tradeAllowed({ allow_buy: false }, "buy", true)).toBe(true);
  });
});
describe("staff date permission", () => {
  it("denies a past date when not allowed", () => { expect(dateAllowed({ allow_past_date: false }, "2026-10-25", "2026-10-26")).toBe(false); });
  it("denies a future date when not allowed", () => { expect(dateAllowed({ allow_future_date: false }, "2026-10-27", "2026-10-26")).toBe(false); });
  it("always allows today", () => { expect(dateAllowed({ allow_past_date: false, allow_future_date: false }, "2026-10-26", "2026-10-26")).toBe(true); });
});
