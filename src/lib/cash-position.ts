/** حساب وضع الصرافة الآن لكل عملة على حدة: النقد في الصناديق مقابل الحوالات الواردة المنتظرة للصرف. */
export type CashMv = { currency_id: number | null; amount: number; movement_type: string };
export type PendingIn = { currency_id: number | null; amount: number };
export type CurrencyPosition = { currencyId: number; cash: number; pending: number; pendingCount: number; after: number; short: boolean };

export function cashPosition(moves: readonly CashMv[], pending: readonly PendingIn[]): CurrencyPosition[] {
  const map = new Map<number, CurrencyPosition>();
  const get = (id: number | null) => {
    const k = id ?? 0;
    let p = map.get(k);
    if (!p) { p = { currencyId: k, cash: 0, pending: 0, pendingCount: 0, after: 0, short: false }; map.set(k, p); }
    return p;
  };
  for (const m of moves) {
    const p = get(m.currency_id);
    p.cash += m.movement_type === "قبض" ? Number(m.amount) : -Number(m.amount);
  }
  for (const t of pending) {
    const p = get(t.currency_id);
    p.pending += Number(t.amount);
    p.pendingCount += 1;
  }
  for (const p of map.values()) {
    p.after = p.cash - p.pending;
    p.short = p.after < 0;
  }
  return [...map.values()];
}
