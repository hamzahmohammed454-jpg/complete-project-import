import { describe, expect, it } from "vitest";

import { commissionByAgent, exchangeSpreads, inPeriod, profitByCurrency, type ProfitRow, type ExchangeSpreadRow } from "@/lib/profits";

const row = (over: Partial<ProfitRow>): ProfitRow => ({
  currency_id: 1,
  amount: 1000,
  commission: 50,
  the_date: "2026-10-10",
  ...over,
});

describe("فوارق البيع والشراء", () => {
  const buy: ExchangeSpreadRow = { kind: "buy", currency_id: 2, exchange_currency_id: 1, amount: 100, exchange_amount: 50000, commission: 9999, the_date: "2026-11-01" };
  const sell: ExchangeSpreadRow = { ...buy, kind: "sell", amount: 80, exchange_amount: 40800 };
  it("يحسب الفارق بالمتوسط المرجح دون إضافة العمولات", () => {
    expect(exchangeSpreads([buy, sell], null, null)[0]).toMatchObject({ buyRate: 500, sellRate: 510, rateDifference: 10, matchedAmount: 80, indicativeSpread: 800 });
  });
  it("لا يخترع فارقاً دون شراء وبيع لنفس الزوج", () => { expect(exchangeSpreads([buy, { ...sell, exchange_currency_id: 3 }], null, null).every((r) => r.rateDifference === null)).toBe(true); });
  it("يحصر الفارق بالفترة المحددة", () => { expect(exchangeSpreads([buy, sell], "2026-11-02", null)).toEqual([]); });
  it("يستخدم المبالغ الفعلية مرجحة بحجم الشراء", () => { expect(exchangeSpreads([buy, { ...buy, amount: 300, exchange_amount: 156000 }, sell], null, null)[0]?.buyRate).toBe(515); });
});

describe("inPeriod", () => {
  it("يقبل داخل الفترة وعلى حديها", () => {
    expect(inPeriod("2026-10-01", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inPeriod("2026-10-31", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inPeriod("2026-10-15", "2026-10-01", "2026-10-31")).toBe(true);
  });
  it("يرفض خارج الفترة", () => {
    expect(inPeriod("2026-09-30", "2026-10-01", "2026-10-31")).toBe(false);
    expect(inPeriod("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
  });
  it("الطرف الفارغ بلا حد", () => {
    expect(inPeriod("2020-01-01", null, "2026-10-31")).toBe(true);
    expect(inPeriod("2099-01-01", "2026-10-01", null)).toBe(true);
  });
});

describe("profitByCurrency", () => {
  it("يجمع العدد والمبالغ والعمولات لكل عملة", () => {
    const map = profitByCurrency(
      [row({}), row({ amount: 500, commission: 25 }), row({ currency_id: 2, amount: 7, commission: 3 })],
      null,
      null,
    );
    expect(map.get(1)).toEqual({ count: 2, amount: 1500, commission: 75 });
    expect(map.get(2)).toEqual({ count: 1, amount: 7, commission: 3 });
  });
  it("يتجاهل الملغاة وخارج الفترة", () => {
    const map = profitByCurrency(
      [row({ canceled: true }), row({ the_date: "2026-09-01" }), row({})],
      "2026-10-01",
      "2026-10-31",
    );
    expect(map.get(1)).toEqual({ count: 1, amount: 1000, commission: 50 });
  });
  it("العمولة الفارغة تُحسب صفرًا", () => {
    const map = profitByCurrency([row({ commission: null })], null, null);
    expect(map.get(1)?.commission).toBe(0);
  });
});

describe("commissionByAgent", () => {
  it("يجمع عمولة كل وكيل لكل عملة", () => {
    const map = commissionByAgent(
      [
        { agent_id: 5, currency_id: 1, commission: 100, the_date: "2026-10-10" },
        { agent_id: 5, currency_id: 1, commission: 40, the_date: "2026-10-11" },
        { agent_id: 5, currency_id: 2, commission: 9, the_date: "2026-10-11" },
        { agent_id: 6, currency_id: 1, commission: 7, the_date: "2026-10-11" },
      ],
      null,
      null,
    );
    expect(map.get(5)?.get(1)).toBe(140);
    expect(map.get(5)?.get(2)).toBe(9);
    expect(map.get(6)?.get(1)).toBe(7);
  });
  it("يتجاهل بلا وكيل والملغاة وخارج الفترة", () => {
    const map = commissionByAgent(
      [
        { agent_id: null, currency_id: 1, commission: 100, the_date: "2026-10-10" },
        { agent_id: 5, currency_id: 1, commission: 100, the_date: "2026-10-10", canceled: true },
        { agent_id: 5, currency_id: 1, commission: 100, the_date: "2026-08-10" },
        { agent_id: 5, currency_id: 1, commission: 30, the_date: "2026-10-10" },
      ],
      "2026-10-01",
      "2026-10-31",
    );
    expect(map.size).toBe(1);
    expect(map.get(5)?.get(1)).toBe(30);
  });
});
