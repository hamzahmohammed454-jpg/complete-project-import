/**
 * تجميع أرباح الصرافة وعمولات الحوالات — منطق نقي قابل للاختبار.
 * العملة المفتاح: commission_currency_id إن وُجد وإلا currency_id (تُحوَّل قبل الاستدعاء).
 */

export type ProfitRow = {
  currency_id: number | null;
  amount: number;
  commission: number | null;
  the_date: string;
  canceled?: boolean | null;
};

export type CurrencyProfit = { count: number; amount: number; commission: number };

export type ExchangeSpreadRow = {
  kind: "buy" | "sell";
  currency_id: number | null;
  exchange_currency_id: number | null;
  amount: number;
  exchange_amount: number | null;
  commission: number | null;
  the_date: string;
};
export function exchangeSpreads(rows: readonly ExchangeSpreadRow[], from: string | null, until: string | null) {
  const groups = new Map<string, { currency_id: number; exchange_currency_id: number; buyAmount: number; buyValue: number; sellAmount: number; sellValue: number }>();
  for (const row of rows) {
    if (row.currency_id == null || row.exchange_currency_id == null || !inPeriod(row.the_date, from, until) || Number(row.amount) <= 0 || row.exchange_amount == null) continue;
    const key = `${row.currency_id}:${row.exchange_currency_id}`;
    const g = groups.get(key) ?? { currency_id: row.currency_id, exchange_currency_id: row.exchange_currency_id, buyAmount: 0, buyValue: 0, sellAmount: 0, sellValue: 0 };
    if (row.kind === "buy") { g.buyAmount += Number(row.amount); g.buyValue += Number(row.exchange_amount); }
    else { g.sellAmount += Number(row.amount); g.sellValue += Number(row.exchange_amount); }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const buyRate = g.buyAmount ? g.buyValue / g.buyAmount : null;
    const sellRate = g.sellAmount ? g.sellValue / g.sellAmount : null;
    const rateDifference = buyRate != null && sellRate != null ? sellRate - buyRate : null;
    const matchedAmount = Math.min(g.buyAmount, g.sellAmount);
    return { ...g, buyRate, sellRate, rateDifference, matchedAmount, indicativeSpread: rateDifference == null ? null : matchedAmount * rateDifference };
  });
}

/** هل التاريخ داخل الفترة؟ الطرف الفارغ يعني بلا حد. الحدود شاملة. */
export function inPeriod(date: string, from: string | null, until: string | null): boolean {
  if (from && date < from) return false;
  if (until && date > until) return false;
  return true;
}

/** عدد العمليات وإجمالي مبالغها وعمولاتها لكل عملة، ضمن الفترة، بلا الملغاة. */
export function profitByCurrency(
  rows: readonly ProfitRow[],
  from: string | null,
  until: string | null,
): Map<number, CurrencyProfit> {
  const map = new Map<number, CurrencyProfit>();
  for (const r of rows) {
    if (r.canceled) continue;
    if (!inPeriod(r.the_date, from, until)) continue;
    const key = r.currency_id ?? 0;
    const p = map.get(key) ?? { count: 0, amount: 0, commission: 0 };
    p.count += 1;
    p.amount += Number(r.amount);
    p.commission += Number(r.commission ?? 0);
    map.set(key, p);
  }
  return map;
}

export type AgentCommissionRow = {
  agent_id: number | null;
  currency_id: number | null;
  commission: number | null;
  the_date: string;
  canceled?: boolean | null;
};

/** عمولات كل وكيل لكل عملة، ضمن الفترة، بلا الملغاة. الوكيل الفارغ يُتجاهل. */
export function commissionByAgent(
  rows: readonly AgentCommissionRow[],
  from: string | null,
  until: string | null,
): Map<number, Map<number, number>> {
  const map = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (r.canceled || r.agent_id == null) continue;
    if (!inPeriod(r.the_date, from, until)) continue;
    const cur = r.currency_id ?? 0;
    const byCur = map.get(r.agent_id) ?? new Map<number, number>();
    byCur.set(cur, (byCur.get(cur) ?? 0) + Number(r.commission ?? 0));
    map.set(r.agent_id, byCur);
  }
  return map;
}
