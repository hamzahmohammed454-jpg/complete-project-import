import { partyNetBalances, type AllAccountsInput, type PartyBalanceRow } from "./all-accounts";

export type DebtFollowupRow = PartyBalanceRow & { last_activity: string; inactive_days: number; needs_followup: boolean };
/** Outstanding debt by currency and time since last posted activity, not invoice due age. */
export function debtFollowup(input: AllAccountsInput, asOf: string): DebtFollowupRow[] {
  const cutoff = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(cutoff)) return [];
  const dates = new Map<string, string>();
  const add = (kind: "customer" | "agent", id: number, cid: number | null, date: string) => {
    if (cid == null || date > asOf) return;
    const key = `${kind}|${id}|${cid}`;
    if (date > (dates.get(key) ?? "")) dates.set(key, date);
  };
  for (const m of input.transferMovements ?? []) add("customer", m.customer_id, m.currency_id, m.the_date);
  for (const v of input.vouchers) add("customer", v.customer_id, v.currency_id, v.the_date);
  for (const c of input.checks) if (c.status === "محصل") add("customer", c.customer_id, c.currency_id, c.collected_date ?? c.the_date);
  for (const t of [...input.outgoing, ...input.incoming]) if (!t.canceled) add("agent", t.agent_id, t.currency_id, t.the_date);
  for (const s of input.settlements) add("agent", s.agent_id, s.currency_id, s.the_date);
  const owners = new Map<number, (typeof input.customers)[number]>();
  for (const p of [...input.customers, ...input.agents]) {
    if (p.account_id == null) continue;
    if (owners.has(p.account_id)) throw new Error("حساب محاسبي مرتبط بأكثر من طرف؛ يلزم مراجعة دليل الحسابات");
    owners.set(p.account_id, p);
  }
  for (const e of input.entries) {
    const p = e.account_id == null ? undefined : owners.get(e.account_id);
    if (p) add(p.kind, p.id, e.currency_id, e.the_date);
  }
  return partyNetBalances(input, "", asOf).filter((r) => r.net > 0).map((r) => {
    const last_activity = dates.get(`${r.kind}|${r.id}|${r.currency_id}`) ?? asOf;
    const inactive_days = Math.max(0, Math.floor((cutoff - Date.parse(`${last_activity}T00:00:00Z`)) / 86_400_000));
    return { ...r, last_activity, inactive_days, needs_followup: inactive_days >= 7 };
  }).sort((a, b) => b.inactive_days - a.inactive_days || a.name.localeCompare(b.name, "ar"));
}