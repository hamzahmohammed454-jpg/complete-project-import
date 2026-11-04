import { describe, expect, it } from "vitest";

import { checkLines, type CheckForStatement } from "@/lib/statement";

const base: CheckForStatement = {
  id: 1,
  the_number: 1,
  check_type: "وارد",
  check_number: "55881",
  amount: 1000,
  currency_id: 1,
  status: "تحت التحصيل",
  the_date: "2026-10-20",
  collected_date: null,
  notes: null,
  created_at: "2026-10-20T10:00:00Z",
};

describe("شيكات العميل في كشف الحساب", () => {
  it("الشيك تحت التحصيل والمرتجع لا يدخلان الكشف", () => {
    expect(checkLines([base])).toEqual([]);
    expect(checkLines([{ ...base, status: "مرتجع" }])).toEqual([]);
  });

  it("الوارد المحصّل يُسجّل له (دائن) بتاريخ التحصيل", () => {
    const lines = checkLines([{ ...base, status: "محصل", collected_date: "2026-10-24" }]);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.credit).toBe(1000);
    expect(line.debit).toBe(0);
    expect(line.date).toBe("2026-10-24");
    expect(line.description).toContain("55881");
  });

  it("الصادر المحصّل يُسجّل عليه (مدين)", () => {
    const lines = checkLines([{ ...base, check_type: "صادر", status: "محصل" }]);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.debit).toBe(1000);
    expect(line.credit).toBe(0);
    expect(line.date).toBe("2026-10-20");
  });
});
