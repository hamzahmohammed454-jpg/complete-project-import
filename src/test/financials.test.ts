import { describe, expect, it } from "vitest";

import { buildStatements, type ChartAccount } from "@/lib/financials";

const chart: ChartAccount[] = [
  { id: 1, account_number: 1, father_number: null, account_name: "الأصول" },
  { id: 2, account_number: 11, father_number: 1, account_name: "الصناديق" },
  { id: 3, account_number: 1101, father_number: 11, account_name: "صندوق" },
  { id: 4, account_number: 4, father_number: null, account_name: "الإيرادات" },
  { id: 5, account_number: 41, father_number: 4, account_name: "عمولات" },
  { id: 6, account_number: 5, father_number: null, account_name: "المصروفات" },
  { id: 7, account_number: 51, father_number: 5, account_name: "تشغيلية" },
];

describe("buildStatements", () => {
  it("net profit is revenue minus expenses for the chosen currency only", () => {
    const s = buildStatements(chart, [
      { account_id: 3, currency_id: 1, side: "مدين", amount: 1000 },
      { account_id: 5, currency_id: 1, side: "دائن", amount: 1000 },
      { account_id: 7, currency_id: 1, side: "مدين", amount: 300 },
      { account_id: 3, currency_id: 1, side: "دائن", amount: 300 },
      { account_id: 5, currency_id: 3, side: "دائن", amount: 50 },
    ], 1);
    expect(s.totals.revenue).toBe(1000);
    expect(s.totals.expenses).toBe(300);
    expect(s.netProfit).toBe(700);
    expect(s.totals.assets).toBe(700);
  });
});
