/**
 * تقرير «كافة الحسابات»: صافي رصيد كل عميل ووكيل بكل عملة حتى يوم محدد.
 * الإشارات مطابقة لكشف الحساب الفردي: موجب = مدين (لنا عليه)، سالب = دائن (له علينا).
 */

export type PartyRef = {
  kind: "customer" | "agent";
  id: number;
  name: string;
  num: number | null;
  account_id: number | null;
};

type Dated = { the_date: string };

export type AllAccountsInput = {
  transferMovements?: readonly { customer_id: number; currency_id: number; debit: number | string; credit: number | string; the_date: string }[];
  customers: readonly PartyRef[];
  agents: readonly PartyRef[];
  vouchers: readonly ({ customer_id: number; voucher_type: string; amount: number | string; currency_id: number } & Dated)[];
  checks: readonly ({ customer_id: number; check_type: string; status: string; amount: number | string; currency_id: number; collected_date: string | null } & Dated)[];
  outgoing: readonly ({ agent_id: number; amount: number | string; currency_id: number; canceled: boolean } & Dated)[];
  incoming: readonly ({ agent_id: number; amount: number | string; currency_id: number; canceled: boolean } & Dated)[];
  settlements: readonly ({ agent_id: number; amount: number | string; currency_id: number; direction: string } & Dated)[];
  entries: readonly ({ account_id: number | null; side: string; amount: number | string; currency_id: number | null } & Dated)[];
};

export type PartyBalanceRow = {
  kind: "customer" | "agent";
  id: number;
  name: string;
  num: number | null;
  currency_id: number;
  /** موجب = مدين (لنا عليه)، سالب = دائن (له علينا). */
  net: number;
};

function inRange(date: string, from: string, until: string): boolean {
  return (!from || date >= from) && date <= until;
}

/** يجمع صافي كل طرف بكل عملة في الفترة، ويهمل الأطراف المتوازنة (صفر). */
export function partyNetBalances(input: AllAccountsInput, from: string, until: string): PartyBalanceRow[] {
  // key: `${kind}|${id}|${currency_id}`
  const nets = new Map<string, number>();
  const add = (kind: "customer" | "agent", id: number, currencyId: number | null, signed: number) => {
    if (currencyId == null) return;
    const key = `${kind}|${id}|${currencyId}`;
    nets.set(key, (nets.get(key) ?? 0) + signed);
  };

  for (const m of input.transferMovements ?? []) {
    if (inRange(m.the_date, from, until)) add("customer", m.customer_id, m.currency_id, Number(m.debit) - Number(m.credit));
  }
  for (const v of input.vouchers) {
    if (!inRange(v.the_date, from, until)) continue;
    // صرف للعميل ← عليه (مدين)؛ قبض/إيداع ← له (دائن)
    add("customer", v.customer_id, v.currency_id, v.voucher_type === "صرف" ? Number(v.amount) : -Number(v.amount));
  }
  for (const c of input.checks) {
    if (c.status !== "محصل") continue;
    const date = c.collected_date ?? c.the_date;
    if (!inRange(date, from, until)) continue;
    // وارد محصل ← له؛ صادر محصل ← عليه
    add("customer", c.customer_id, c.currency_id, c.check_type === "وارد" ? -Number(c.amount) : Number(c.amount));
  }
  for (const t of input.outgoing) {
    if (t.canceled || !inRange(t.the_date, from, until)) continue;
    add("agent", t.agent_id, t.currency_id, -Number(t.amount)); // صادرة عبره ← له
  }
  for (const t of input.incoming) {
    if (t.canceled || !inRange(t.the_date, from, until)) continue;
    add("agent", t.agent_id, t.currency_id, Number(t.amount)); // واردة منه ← عليه
  }
  for (const s of input.settlements) {
    if (!inRange(s.the_date, from, until)) continue;
    add("agent", s.agent_id, s.currency_id, s.direction === "paid_to_agent" ? Number(s.amount) : -Number(s.amount));
  }

  const accountOwner = new Map<number, PartyRef>();
  for (const p of [...input.customers, ...input.agents]) {
    if (p.account_id == null) continue;
    if (accountOwner.has(p.account_id)) throw new Error("حساب محاسبي مرتبط بأكثر من طرف؛ يلزم مراجعة دليل الحسابات");
    accountOwner.set(p.account_id, p);
  }
  for (const e of input.entries) {
    if (e.account_id == null || !inRange(e.the_date, from, until)) continue;
    const owner = accountOwner.get(e.account_id);
    if (!owner) continue; // قيود الحسابات الأخرى (صناديق، إيرادات…) ليست طرفًا
    add(owner.kind, owner.id, e.currency_id, e.side === "مدين" ? Number(e.amount) : -Number(e.amount));
  }

  const byId = new Map<string, PartyRef>();
  for (const p of [...input.customers, ...input.agents]) byId.set(`${p.kind}|${p.id}`, p);

  const rows: PartyBalanceRow[] = [];
  for (const [key, net] of nets) {
    if (Math.abs(net) < 1e-9) continue;
    const [kind, idStr, cidStr] = key.split("|");
    const p = byId.get(`${kind}|${idStr}`);
    if (!p) continue;
    rows.push({ kind: p.kind, id: p.id, name: p.name, num: p.num, currency_id: Number(cidStr), net });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ar") || a.currency_id - b.currency_id);
}

export type AccountFilter = "all" | "debtors" | "creditors";

/** يرشّح الصفوف حسب اختيار «الحسابات»: الدائنون والمدينون، أو المدينون فقط، أو الدائنون فقط. */
export function filterBySide(rows: readonly PartyBalanceRow[], filter: AccountFilter): PartyBalanceRow[] {
  if (filter === "debtors") return rows.filter((r) => r.net > 0);
  if (filter === "creditors") return rows.filter((r) => r.net < 0);
  return [...rows];
}

/** إجماليات التقرير: مجموع المدين والدائن لكل عملة معروضة. */
export function totalsByCurrency(rows: readonly PartyBalanceRow[]): Map<number, { debit: number; credit: number }> {
  const out = new Map<number, { debit: number; credit: number }>();
  for (const r of rows) {
    const t = out.get(r.currency_id) ?? { debit: 0, credit: 0 };
    if (r.net > 0) t.debit += r.net;
    else t.credit += -r.net;
    out.set(r.currency_id, t);
  }
  return out;
}
