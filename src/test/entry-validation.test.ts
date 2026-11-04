import { describe, expect, it } from "vitest";
import { isEntryBalanced } from "@/lib/entry-validation";
const debit = { side: "مدين", amount: "100", account_id: "1", currency_id: "1" };
const credit = { ...debit, side: "دائن", account_id: "2" };
describe("entry money integrity", () => {
  it("balances each currency separately", () => {
    expect(isEntryBalanced([debit, { ...credit, currency_id: "2" }])).toBe(false);
    expect(isEntryBalanced([debit, credit])).toBe(true);
  });
  it("rejects nonpositive and nonfinite money", () => {
    for (const amount of ["0", "-100", "Infinity", "NaN"]) expect(isEntryBalanced([{ ...debit, amount }, { ...credit, amount }])).toBe(false);
  });
  it("requires account and currency on every line", () => {
    expect(isEntryBalanced([{ ...debit, currency_id: "" }, credit])).toBe(false);
    expect(isEntryBalanced([{ ...debit, account_id: "" }, credit])).toBe(false);
  });
});