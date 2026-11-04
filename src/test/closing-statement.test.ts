import { describe, expect, it } from "vitest";

import { adenDate } from "@/lib/closing";
import { agentLines, balanceLabel, balanceSentence, currencySummary, voucherLines, withRunningBalance } from "@/lib/statement";

describe("adenDate", () => {
  it("uses Aden time (UTC+3): 22:30 UTC is already the next day", () => {
    expect(adenDate("2026-10-24T22:30:00Z")).toBe("2026-10-25");
    expect(adenDate("2026-10-24T20:00:00Z")).toBe("2026-10-24");
  });
});

describe("agent statement", () => {
  const base = { created_at: "2026-10-24T08:00:00Z", party: "x" };
  const lines = agentLines({
    outgoing: [
      { ...base, id: 1, transfer_number: 1, amount: 50000, currency_id: 1, the_date: "2026-10-24", canceled: false },
      { ...base, id: 2, transfer_number: 2, amount: 7000, currency_id: 1, the_date: "2026-10-24", canceled: true },
    ],
    incoming: [{ ...base, id: 3, transfer_number: 1, amount: 20000, currency_id: 1, the_date: "2026-10-24", canceled: false }],
    settlements: [{ id: 1, amount: 10000, currency_id: 1, direction: "paid_to_agent", the_date: "2026-10-24", notes: null, created_at: "2026-10-24T10:00:00Z" }],
    entries: [],
  });

  it("outgoing via the agent is credited (له), incoming from him debited (عليه), canceled is skipped", () => {
    const { debit, credit, balance } = withRunningBalance(lines, 1);
    expect(credit).toBe(50000);
    expect(debit).toBe(30000);
    expect(balance).toBe(-20000);
    expect(balanceLabel(balance)).toBe("له");
  });

  it("other currencies are not mixed in", () => {
    expect(withRunningBalance(lines, 3).rows).toHaveLength(0);
  });
});

describe("statement summary (original system layout)", () => {
  const line = (currency_id: number, debit: number, credit: number, date = "2026-10-24") => ({
    date, description: "", debit, credit, currency_id, sortKey: date,
  });

  it("puts each currency's net balance in debit or credit and converts it to the local currency", () => {
    const lines = [line(1, 0, 28_106_224), line(3, 5_189.27, 0), line(3, 100, 0, "2026-10-26")];
    const rates = new Map([[3, 535]]);
    const s = currencySummary(lines, "2026-10-24", rates, 1);
    const usd = s.rows.find((r) => r.currency_id === 3);
    expect(usd?.debit).toBe(5_189.27); // the later line is after "until day"
    expect(usd?.equivDebit).toBeCloseTo(2_776_259.45, 2);
    expect(s.rows.find((r) => r.currency_id === 1)?.equivCredit).toBe(28_106_224);
    expect(s.net).toBeCloseTo(-25_329_964.55, 2);
  });

  it("flags a currency with no exchange rate", () => {
    expect(currencySummary([line(2, 10, 0)], "2026-10-24", new Map(), 1).missingRate).toBe(true);
  });

  it("words the balance like the original: لكم for credit, عليكم for debit", () => {
    expect(balanceSentence(-1000, "ريال يمني")).toBe("الرصيد لكم ألف ريال يمني");
    expect(balanceSentence(2000, "دولار")).toBe("الرصيد عليكم ألفان دولار");
    expect(balanceSentence(0, "دولار")).toBe("الرصيد صفر");
  });
});

describe("customer cash vouchers in statement", () => {
  const v = (voucher_type: string, amount: number) => ({
    id: 1, the_number: 7, voucher_type, amount, currency_id: 1,
    the_date: "2026-10-24", cash_name: null, notes: null, created_at: "2026-10-24T10:00:00Z",
  });

  it("receipt and deposit are credit (له), payment is debit (عليه)", () => {
    const lines = voucherLines([v("قبض", 5000), v("إيداع", 3000), v("صرف", 2000)]);
    expect(lines[0]).toMatchObject({ debit: 0, credit: 5000 });
    expect(lines[1]).toMatchObject({ debit: 0, credit: 3000 });
    expect(lines[2]).toMatchObject({ debit: 2000, credit: 0 });
    expect(lines[0]?.description).toContain("سند قبض 7");
  });
});
