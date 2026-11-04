import { amountWords } from "@/lib/tafteesh";

/** نوع المستند في كشف الحساب — لتصفية الكشف بنوع العملية. */
export type StatementKind = "transfer" | "voucher" | "check" | "entry" | "settlement";

/** كشف الحساب: عليه (مدين) يزيد ما على الطرف لنا، وله (دائن) يزيد ما له علينا. */
export type StatementLine = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  currency_id: number | null;
  sortKey: string;
  kind?: StatementKind;
};

export type TransferForStatement = {
  id: number;
  transfer_number: number | null;
  amount: number | string;
  currency_id: number;
  the_date: string;
  canceled: boolean;
  party: string;
  created_at: string;
};

export type SettlementForStatement = {
  id: number;
  amount: number | string;
  currency_id: number;
  direction: string;
  the_date: string;
  notes: string | null;
  created_at: string;
};

export type EntryDetailForStatement = {
  side: string;
  amount: number | string;
  currency_id: number | null;
  notes: string | null;
  entry_number: number;
  the_date: string;
  entry_notes: string | null;
  created_at: string;
};

/**
 * حساب الوكيل:
 * - الحوالة الصادرة عبره: يدفعها الوكيل للمستلم نيابة عنا ← له.
 * - الحوالة الواردة منه: قبضها الوكيل ونسلّمها نحن ← عليه.
 * - دفعنا له في التسوية ← عليه، واستلمنا منه ← له.
 * الملغاة لا تدخل الكشف.
 */
export function agentLines(input: {
  outgoing: readonly TransferForStatement[];
  incoming: readonly TransferForStatement[];
  settlements: readonly SettlementForStatement[];
  entries: readonly EntryDetailForStatement[];
}): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const t of input.outgoing) {
    if (t.canceled) continue;
    lines.push({
      date: t.the_date,
      description: `حوالة صادرة ${t.transfer_number ?? t.id} — ${t.party}`,
      debit: 0,
      credit: Number(t.amount),
      currency_id: t.currency_id,
      sortKey: `${t.the_date}|${t.created_at}`,
      kind: "transfer",
    });
  }
  for (const t of input.incoming) {
    if (t.canceled) continue;
    lines.push({
      date: t.the_date,
      description: `حوالة واردة ${t.transfer_number ?? t.id} — ${t.party}`,
      debit: Number(t.amount),
      credit: 0,
      currency_id: t.currency_id,
      sortKey: `${t.the_date}|${t.created_at}`,
      kind: "transfer",
    });
  }
  for (const s of input.settlements) {
    const paid = s.direction === "paid_to_agent";
    lines.push({
      date: s.the_date,
      description: (paid ? "تسوية: دفعنا للوكيل" : "تسوية: استلمنا من الوكيل") + (s.notes ? ` — ${s.notes}` : ""),
      debit: paid ? Number(s.amount) : 0,
      credit: paid ? 0 : Number(s.amount),
      currency_id: s.currency_id,
      sortKey: `${s.the_date}|${s.created_at}`,
      kind: "settlement",
    });
  }
  lines.push(...entryLines(input.entries));
  return lines;
}

export type VoucherForStatement = {
  id: number;
  the_number: number | null;
  voucher_type: string;
  amount: number | string;
  currency_id: number;
  the_date: string;
  cash_name: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * سندات العميل في كشف حسابه:
 * - قبض من العميل أو إيداع في حسابه: استلمنا منه نقدًا ← له.
 * - صرف للعميل: دفعنا له نقدًا ← عليه.
 */
export function voucherLines(vouchers: readonly VoucherForStatement[]): StatementLine[] {
  return vouchers.map((v) => {
    const pays = v.voucher_type === "صرف";
    return {
      date: v.the_date,
      description: `سند ${v.voucher_type} ${v.the_number ?? v.id}` + (v.notes ? ` — ${v.notes}` : ""),
      debit: pays ? Number(v.amount) : 0,
      credit: pays ? 0 : Number(v.amount),
      currency_id: v.currency_id,
      sortKey: `${v.the_date}|${v.created_at}`,
      kind: "voucher",
    };
  });
}

export type CheckForStatement = {
  id: number;
  the_number: number | null;
  check_type: string;
  check_number: string;
  amount: number | string;
  currency_id: number;
  status: string;
  the_date: string;
  collected_date: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * شيكات العميل في كشف حسابه — المحصّلة فقط:
 * - وارد محصّل: قبضنا قيمته من العميل ← له.
 * - صادر محصّل: دفعنا قيمته للعميل ← عليه.
 * تحت التحصيل والمرتجع لا تدخل الكشف.
 */
export function checkLines(checks: readonly CheckForStatement[]): StatementLine[] {
  return checks
    .filter((c) => c.status === "محصل")
    .map((c) => {
      const incoming = c.check_type === "وارد";
      const date = c.collected_date ?? c.the_date;
      return {
        date,
        description: `شيك ${c.check_type} ${c.check_number}` + (c.notes ? ` — ${c.notes}` : ""),
        debit: incoming ? 0 : Number(c.amount),
        credit: incoming ? Number(c.amount) : 0,
        currency_id: c.currency_id,
        sortKey: `${date}|${c.created_at}`,
        kind: "check",
      };
    });
}

export function entryLines(entries: readonly EntryDetailForStatement[]): StatementLine[] {
  return entries.map((e) => ({
    date: e.the_date,
    description: `قيد ${e.entry_number}` + (e.notes || e.entry_notes ? ` — ${e.notes || e.entry_notes}` : ""),
    debit: e.side === "مدين" ? Number(e.amount) : 0,
    credit: e.side === "دائن" ? Number(e.amount) : 0,
    currency_id: e.currency_id,
    sortKey: `${e.the_date}|${e.created_at}`,
    kind: "entry" as const,
  }));
}

export type BalancedLine = StatementLine & { balance: number };

/** يرتّب سطور عملة واحدة زمنيًا ويضيف الرصيد التراكمي (عليه − له). */
export function withRunningBalance(lines: readonly StatementLine[], currencyId: number | null) {
  const own = lines.filter((l) => l.currency_id === currencyId).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  let balance = 0;
  let debit = 0;
  let credit = 0;
  const rows: BalancedLine[] = own.map((l) => {
    balance += l.debit - l.credit;
    debit += l.debit;
    credit += l.credit;
    return { ...l, balance };
  });
  return { rows, debit, credit, balance };
}

export function balanceLabel(balance: number): string {
  if (balance > 0) return "عليه";
  if (balance < 0) return "له";
  return "متوازن";
}

/** صيغة النظام الأصلي: «الرصيد لكم …» إذا كان له، و«الرصيد عليكم …» إذا كان عليه. */
export function balanceSentence(balance: number, currencyName: string): string {
  if (Math.abs(balance) < 0.005) return "الرصيد صفر";
  return `الرصيد ${balance < 0 ? "لكم" : "عليكم"} ${amountWords(balance, currencyName)}`;
}

export type CurrencySummaryRow = {
  currency_id: number;
  debit: number;
  credit: number;
  equivDebit: number;
  equivCredit: number;
  balance: number;
};

/**
 * ملخّص كل العملات حتى يوم معيّن: رصيد كل عملة في عمود مدين أو دائن،
 * ومقابله بالعملة المحلية بسعر الصرف (rates: سعر الوحدة بالعملة المحلية؛ المحلية = 1).
 */
export function currencySummary(
  lines: readonly StatementLine[],
  untilDate: string,
  rates: ReadonlyMap<number, number>,
  localCurrencyId: number,
) {
  const sums = new Map<number, number>();
  for (const l of lines) {
    if (l.currency_id == null || l.date > untilDate) continue;
    sums.set(l.currency_id, (sums.get(l.currency_id) ?? 0) + l.debit - l.credit);
  }
  const rows: CurrencySummaryRow[] = [];
  let equivDebit = 0;
  let equivCredit = 0;
  let missingRate = false;
  for (const [currency_id, balance] of sums) {
    const rate = currency_id === localCurrencyId ? 1 : rates.get(currency_id);
    if (rate == null) missingRate = true;
    const equiv = balance * (rate ?? 0);
    const row: CurrencySummaryRow = {
      currency_id,
      balance,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? -balance : 0,
      equivDebit: equiv > 0 ? equiv : 0,
      equivCredit: equiv < 0 ? -equiv : 0,
    };
    equivDebit += row.equivDebit;
    equivCredit += row.equivCredit;
    rows.push(row);
  }
  return { rows, equivDebit, equivCredit, net: equivDebit - equivCredit, missingRate };
}

export type CustomerTransferMovement = { customer_id: number; currency_id: number; debit: number | string; credit: number | string; the_date: string; notes: string; created_at: string };
export function customerTransferLines(rows: readonly CustomerTransferMovement[]): StatementLine[] {
 return rows.map((r) => ({ date: r.the_date, description: r.notes, debit: Number(r.debit), credit: Number(r.credit), currency_id: r.currency_id, sortKey: `${r.the_date}|${r.created_at}`, kind: "transfer" }));
}
