import { describe, expect, it } from "vitest";
import { inventoryActions, inventoryAdjustment } from "@/lib/inventory";
describe("ترحيل فارق الجرد", () => {
  it("يرحل الزيادة مدينة للصندوق ودائنة للحساب المقابل", () => {
    expect(inventoryAdjustment({ currency_id: 1, system_amount: 1000, real_amount: 1050 })).toEqual({ difference: 50, amount: 50, boxSide: "مدين", counterpartSide: "دائن" });
  });
  it("يرحل النقص دائناً للصندوق ومديناً للحساب المقابل", () => {
    expect(inventoryAdjustment({ currency_id: 2, system_amount: 1000, real_amount: 970 })).toEqual({ difference: -30, amount: 30, boxSide: "دائن", counterpartSide: "مدين" });
  });
  it("لا يسمح بترحيل المطابق", () => { expect(inventoryActions(false, false, false).post).toBe(false); });
  it("يلزم إلغاء الترحيل قبل التعديل أو الحذف", () => { expect(inventoryActions(true, false, true)).toEqual({ post: false, edit: false, remove: false, reverse: true }); });
  it("يتيح التعديل والحذف بعد إلغاء الترحيل", () => { expect(inventoryActions(false, false, true)).toEqual({ post: true, edit: true, remove: true, reverse: false }); });
  it("يرفض المبلغ السالب", () => { expect(() => inventoryAdjustment({ currency_id: 1, system_amount: 100, real_amount: -1 })).toThrow(); });
});