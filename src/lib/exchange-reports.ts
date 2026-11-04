/** قواعد تقارير البيع والشراء: حسابات نقية تُطبق على عمليات الصرف المقروءة من القاعدة. */
import { priceLimitWarning, type PriceLimits } from "@/lib/price-limits";

export type ExchangeRow = {
  kind: "buy" | "sell";
  id: number;
  document_number: number | null;
  the_date: string;
  amount: number | string;
  currency_id: number | null;
  price: number | string;
  exchange_amount: number | string | null;
  exchange_currency_id: number | null;
  commission: number | string | null;
  cash_customer_name: string | null;
};

export type ExchangeTotal = {
  day: string;
  currency_id: number | null;
  exchange_currency_id: number | null;
  count: number;
  amount: number;
  exchange_amount: number;
  commission: number;
  /** متوسط السعر المرجّح = إجمالي المقابل ÷ إجمالي المبلغ */
  avg_price: number;
};

/** إجمالي كل عملة مقابل كل عملة (ولكل يوم إن طُلب): العدد والمبلغ والمقابل والعمولة ومتوسط السعر. */
export function exchangeTotals(rows: readonly ExchangeRow[], byDay: boolean): ExchangeTotal[] {
  const map = new Map<string, ExchangeTotal>();
  for (const r of rows) {
    const day = byDay ? r.the_date : "";
    const key = `${day}|${r.currency_id ?? 0}|${r.exchange_currency_id ?? 0}`;
    const t = map.get(key) ?? { day, currency_id: r.currency_id, exchange_currency_id: r.exchange_currency_id, count: 0, amount: 0, exchange_amount: 0, commission: 0, avg_price: 0 };
    t.count += 1;
    t.amount += Number(r.amount);
    t.exchange_amount += Number(r.exchange_amount ?? Number(r.amount) * Number(r.price));
    t.commission += Number(r.commission ?? 0);
    map.set(key, t);
  }
  return [...map.values()]
    .map((t) => ({ ...t, avg_price: t.amount > 0 ? t.exchange_amount / t.amount : 0 }))
    .sort((a, b) => b.day.localeCompare(a.day) || (a.currency_id ?? 0) - (b.currency_id ?? 0) || (a.exchange_currency_id ?? 0) - (b.exchange_currency_id ?? 0));
}

/** العمليات التي تجاوز سعرها الحد المعتمد للعملة: شراء فوق الحد الأقصى، أو بيع تحت الحد الأدنى. */
export function outOfLimits<T extends ExchangeRow>(rows: readonly T[], limitsOf: (currencyId: number | null) => PriceLimits | null | undefined): T[] {
  return rows.filter((r) => priceLimitWarning(r.kind, Number(r.price), limitsOf(r.currency_id)) != null);
}
