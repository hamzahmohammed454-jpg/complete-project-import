/** حركة واحدة على حساب: طرف القيد (مدين/دائن) والمبلغ والعملة. */
export type AccountMovement = {
  account_id: number | null;
  currency_id: number | null;
  side: string;
  amount: number | string;
};

export type CurrencyStats = {
  debtorsCount: number;
  debtorsTotal: number;
  creditorsCount: number;
  creditorsTotal: number;
};

/**
 * شاشة الإحصائيات: يجمع صافي كل حساب بكل عملة (مدين − دائن)،
 * ثم يصنّف الحسابات إلى مدينون (صافٍ موجب — لنا عليهم) ودائنون (صافٍ سالب — لهم علينا).
 * الحساب المتوازن (صفر) لا يُحسب في أي فئة.
 */
export function debtorCreditorStats(movements: readonly AccountMovement[]): Map<number, CurrencyStats> {
  const nets = new Map<string, number>();
  for (const m of movements) {
    if (m.account_id == null) continue;
    const key = `${m.currency_id ?? 0}|${m.account_id}`;
    const signed = m.side === "مدين" || m.side === "debit" ? Number(m.amount) : -Number(m.amount);
    nets.set(key, (nets.get(key) ?? 0) + signed);
  }
  const out = new Map<number, CurrencyStats>();
  for (const [key, net] of nets) {
    if (Math.abs(net) < 1e-9) continue;
    const cid = Number(key.split("|")[0]);
    const s = out.get(cid) ?? { debtorsCount: 0, debtorsTotal: 0, creditorsCount: 0, creditorsTotal: 0 };
    if (net > 0) {
      s.debtorsCount += 1;
      s.debtorsTotal += net;
    } else {
      s.creditorsCount += 1;
      s.creditorsTotal += -net;
    }
    out.set(cid, s);
  }
  return out;
}
