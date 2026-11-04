import { describe, expect, it } from "vitest";
import { customerTransferLines } from "@/lib/statement";
import { partyNetBalances, type AllAccountsInput } from "@/lib/all-accounts";
const movements = [{ customer_id: 1, currency_id: 1, debit: 100, credit: 0, the_date: "2026-10-26", notes: "حوالة", created_at: "2026-10-26T10:00:00Z" }, { customer_id: 1, currency_id: 1, debit: 2, credit: 0, the_date: "2026-10-26", notes: "عمولة", created_at: "2026-10-26T10:00:00Z" }];
describe("Customer account transfer movements", () => {
  it("shows principal and commission separately with 102 total debit", () => { const rows = customerTransferLines(movements); expect(rows.reduce((sum, row) => sum + row.debit - row.credit, 0)).toBe(102); });
  it("includes incoming account credit only when posted", () => { expect(customerTransferLines([{ ...movements[0], customer_id: 1, currency_id: 1, debit: 0, credit: 50, the_date: "2026-10-26", notes: "تسليم", created_at: "2026-10-26" }])[0]?.credit).toBe(50); });
  it("uses the same movements in all-account totals without duplication", () => { const input: AllAccountsInput = { customers: [{ kind: "customer", id: 1, name: "عميل", num: 1, account_id: 1 }], agents: [], vouchers: [], checks: [], outgoing: [], incoming: [], settlements: [], entries: [], transferMovements: movements }; expect(partyNetBalances(input, "", "2026-10-26")[0]?.net).toBe(102); });
});