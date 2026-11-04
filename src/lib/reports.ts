export type DetailRow = { account_id: number | null; currency_id: number | null; side: string; amount: number };

export type TrialLine = { account_id: number; currency_id: number; debit: number; credit: number; balance: number };

/** Trial balance: debit/credit totals per account per currency; balance = debit − credit. */
export function trialBalance(rows: readonly DetailRow[]): TrialLine[] {
  const map = new Map<string, TrialLine>();
  for (const r of rows) {
    if (r.account_id == null) continue;
    const cur = r.currency_id ?? 0;
    const key = `${r.account_id}|${cur}`;
    const line = map.get(key) ?? { account_id: r.account_id, currency_id: cur, debit: 0, credit: 0, balance: 0 };
    const amt = Number(r.amount);
    if (r.side === "مدين" || r.side === "debit") line.debit += amt;
    else line.credit += amt;
    line.balance = line.debit - line.credit;
    map.set(key, line);
  }
  return [...map.values()];
}

/** Sums amounts by currency. */
export function sumByCurrency<T extends { currency_id: number | null; amount: number }>(rows: readonly T[]) {
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.currency_id ?? 0, (map.get(r.currency_id ?? 0) ?? 0) + Number(r.amount));
  return map;
}
