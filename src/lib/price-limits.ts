/** حدود الأسعار المعتمدة لكل عملة: أقل سعر بيع وأعلى سعر شراء. */
export type PriceLimits = {
  min_sell_price: number | string | null;
  max_buy_price: number | string | null;
};

/**
 * تنبيه عند تجاوز السعر الحدود المعتمدة — تنبيه فقط، لا يمنع الحفظ.
 * شراء: السعر فوق الحد الأقصى للشراء. بيع: السعر تحت الحد الأدنى للبيع.
 */
export function priceLimitWarning(
  kind: "buy" | "sell",
  price: number,
  limits: PriceLimits | null | undefined,
): string | null {
  if (!limits || !(price > 0)) return null;
  const maxBuy = limits.max_buy_price != null ? Number(limits.max_buy_price) : null;
  const minSell = limits.min_sell_price != null ? Number(limits.min_sell_price) : null;
  if (kind === "buy" && maxBuy != null && price > maxBuy) {
    return `تنبيه: سعر الشراء أعلى من الحد الأقصى المعتمد (${maxBuy})`;
  }
  if (kind === "sell" && minSell != null && price < minSell) {
    return `تنبيه: سعر البيع أقل من الحد الأدنى المعتمد (${minSell})`;
  }
  return null;
}
