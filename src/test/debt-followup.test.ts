import { expect, it } from "vitest";
import { debtFollowup } from "@/lib/debt-followup";
import type { AllAccountsInput } from "@/lib/all-accounts";
const base: AllAccountsInput = { customers: [{ kind: "customer", id: 1, name: "عميل", num: 1, account_id: 10 }], agents: [], vouchers: [], checks: [], outgoing: [], incoming: [], settlements: [], entries: [] };
it("follows up at exactly one week using full-history balances separately per currency", () => {
  const rows = debtFollowup({ ...base, vouchers: [
    { customer_id: 1, voucher_type: "صرف", amount: 100, currency_id: 1, the_date: "2026-09-01" },
    { customer_id: 1, voucher_type: "قبض", amount: 20, currency_id: 1, the_date: "2026-10-20" },
    { customer_id: 1, voucher_type: "صرف", amount: 50, currency_id: 2, the_date: "2026-10-21" },
    { customer_id: 1, voucher_type: "قبض", amount: 80, currency_id: 1, the_date: "2026-10-28" },
  ] }, "2026-10-27");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ net: 80, currency_id: 1, inactive_days: 7, needs_followup: true });
  expect(rows[1]).toMatchObject({ net: 50, currency_id: 2, inactive_days: 6, needs_followup: false });
});
it("uses check collection date and does not treat uncollected checks as activity", () => {
  const rows = debtFollowup({ ...base, checks: [
    { customer_id: 1, check_type: "صادر", status: "محصل", amount: 30, currency_id: 1, the_date: "2026-09-01", collected_date: "2026-10-20" },
    { customer_id: 1, check_type: "صادر", status: "تحت التحصيل", amount: 90, currency_id: 1, the_date: "2026-10-26", collected_date: null },
  ] }, "2026-10-27");
  expect(rows[0]).toMatchObject({ net: 30, inactive_days: 7, last_activity: "2026-10-20" });
});
it("ignores canceled transfers and does not follow up balanced accounts", () => {
  const input: AllAccountsInput = { ...base, agents: [{ kind: "agent", id: 2, name: "وكيل", num: 2, account_id: 20 }], incoming: [{ agent_id: 2, amount: 500, currency_id: 1, the_date: "2026-10-01", canceled: true }], transferMovements: [{ customer_id: 1, currency_id: 1, debit: 100, credit: 100, the_date: "2026-10-01" }] };
  expect(debtFollowup(input, "2026-10-27")).toEqual([]);
});
it("rejects ambiguous shared ledger accounts rather than assigning debt to the wrong party", () => {
  expect(() => debtFollowup({ ...base, agents: [{ kind: "agent", id: 2, name: "وكيل", num: 2, account_id: 10 }] }, "2026-10-27")).toThrow();
});