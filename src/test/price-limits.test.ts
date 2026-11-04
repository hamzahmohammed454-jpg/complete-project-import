import { describe, expect, it } from "vitest";

import { priceLimitWarning } from "@/lib/price-limits";

describe("حدود الأسعار", () => {
  const limits = { min_sell_price: 150, max_buy_price: 160 };

  it("ينبّه عند شراء فوق الحد الأقصى", () => {
    expect(priceLimitWarning("buy", 161, limits)).toContain("الحد الأقصى");
  });

  it("ينبّه عند بيع تحت الحد الأدنى", () => {
    expect(priceLimitWarning("sell", 149, limits)).toContain("الحد الأدنى");
  });

  it("لا تنبيه داخل الحدود", () => {
    expect(priceLimitWarning("buy", 160, limits)).toBeNull();
    expect(priceLimitWarning("sell", 150, limits)).toBeNull();
  });

  it("لا تنبيه بلا حدود أو بسعر صفر", () => {
    expect(priceLimitWarning("buy", 999, null)).toBeNull();
    expect(priceLimitWarning("buy", 0, limits)).toBeNull();
    expect(priceLimitWarning("sell", 100, { min_sell_price: null, max_buy_price: null })).toBeNull();
  });
});
