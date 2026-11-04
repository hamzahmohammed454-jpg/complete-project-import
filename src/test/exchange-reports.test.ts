import { describe, expect, it } from "vitest";

import { exchangeTotals, outOfLimits, type ExchangeRow } from "@/lib/exchange-reports";

const row = (p: Partial<ExchangeRow>): ExchangeRow => ({
  kind: "buy", id: 1, document_number: 1, the_date: "2026-10-28", amount: 100, currency_id: 1, price: 530,
  exchange_amount: null, exchange_currency_id: 2, commission: 0, cash_customer_name: null, ...p,
});

describe("إجماليات البيع والشراء", () => {
  it("يجمع المبلغ والمقابل لكل عملة ويحسب متوسط السعر", () => {
    const t = exchangeTotals([row({ amount: 100, price: 530, exchange_amount: 53000 }), row({ id: 2, amount: 100, price: 540, exchange_amount: 54000 })], false);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ count: 2, amount: 200, exchange_amount: 107000, avg_price: 535 });
  });

  it("يفصل كل يوم عن الآخر عند الإجمالي اليومي", () => {
    const t = exchangeTotals([row({}), row({ id: 2, the_date: "2026-10-27" })], true);
    expect(t.map((x) => x.day)).toEqual(["2026-10-28", "2026-10-27"]);
  });

  it("لا يخلط عملتين مختلفتين", () => {
    expect(exchangeTotals([row({ currency_id: 1 }), row({ id: 2, currency_id: 3 })], false)).toHaveLength(2);
  });
});

describe("العمليات التي تجاوزت الحد", () => {
  const limits = () => ({ min_sell_price: 525, max_buy_price: 535 });
  it("تظهر الشراء فوق الحد الأعلى والبيع تحت الحد الأدنى فقط", () => {
    const rows = [
      row({ id: 1, kind: "buy", price: 536 }),
      row({ id: 2, kind: "buy", price: 535 }),
      row({ id: 3, kind: "sell", price: 524 }),
      row({ id: 4, kind: "sell", price: 525 }),
    ];
    expect(outOfLimits(rows, limits).map((r) => r.id)).toEqual([1, 3]);
  });
});
