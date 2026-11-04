import { describe, expect, it } from "vitest";
import { canExportBeforeCollection, checkCoversTransfer } from "@/lib/transfer-check";
describe("Transfer received by check", () => {
  it("allows export before collection as requested", () => { expect(canExportBeforeCollection("تحت التحصيل")).toBe(true); });
  it("does not accept bounced checks", () => { expect(canExportBeforeCollection("مرتجع")).toBe(false); });
  it("matches principal and commission in the same currency", () => { expect(checkCoversTransfer({ amount: 102, currency_id: 1, check_type: "وارد", status: "تحت التحصيل" }, 100, 2, 1)).toBe(true); expect(checkCoversTransfer({ amount: 100, currency_id: 1, check_type: "وارد", status: "تحت التحصيل" }, 100, 2, 1)).toBe(false); });
  it("rejects another currency", () => { expect(checkCoversTransfer({ amount: 102, currency_id: 7, check_type: "وارد", status: "تحت التحصيل" }, 100, 2, 1)).toBe(false); });
});