import { describe, expect, it } from "vitest";

import { debtorCreditorStats } from "@/lib/statistics";

describe("إحصائيات المدينون والدائنون", () => {
  it("يصنّف الحساب الموجب مدينًا والسالب دائنًا لكل عملة", () => {
    const stats = debtorCreditorStats([
      { account_id: 1, currency_id: 10, side: "مدين", amount: 500 },
      { account_id: 1, currency_id: 10, side: "دائن", amount: 200 },
      { account_id: 2, currency_id: 10, side: "دائن", amount: 700 },
      { account_id: 3, currency_id: 20, side: "مدين", amount: 100 },
    ]);
    const c10 = stats.get(10)!;
    expect(c10.debtorsCount).toBe(1);
    expect(c10.debtorsTotal).toBe(300);
    expect(c10.creditorsCount).toBe(1);
    expect(c10.creditorsTotal).toBe(700);
    expect(stats.get(20)!.debtorsTotal).toBe(100);
  });

  it("يتجاهل الحساب المتوازن والحركات بلا حساب", () => {
    const stats = debtorCreditorStats([
      { account_id: 1, currency_id: 10, side: "مدين", amount: 100 },
      { account_id: 1, currency_id: 10, side: "دائن", amount: 100 },
      { account_id: null, currency_id: 10, side: "مدين", amount: 50 },
    ]);
    expect(stats.size).toBe(0);
  });
});
