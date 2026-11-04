import { describe, expect, it } from "vitest";
import { groupVoucherRows, multiVoucherLines } from "@/lib/multi-voucher";
import { voucherLines, withRunningBalance } from "@/lib/statement";

describe("multi-currency vouchers", () => {
  it("accepts independent positive amounts in two currencies", () => {
    expect(multiVoucherLines([{ currency_id: "1", amount: "100" }, { currency_id: "2", amount: "50000" }])).toEqual([{ currency_id: 1, amount: 100 }, { currency_id: 2, amount: 50000 }]);
  });
  it("rejects repeated currencies", () => {
    expect(() => multiVoucherLines([{ currency_id: "1", amount: "100" }, { currency_id: "1", amount: "50" }])).toThrow();
  });
  it("rejects zero, negative, and non-finite amounts", () => {
    for (const amount of ["0", "-1", "Infinity", "NaN"]) expect(() => multiVoucherLines([{ currency_id: "1", amount }, { currency_id: "2", amount: "50" }])).toThrow();
  });
  it("shows one document with its first row as the print reference", () => {
    const rows = groupVoucherRows([{ id: 2, batch_id: "a", batch_position: 2 }, { id: 1, batch_id: "a", batch_position: 1 }, { id: 3, batch_id: null, batch_position: null }]);
    expect(rows.map((row) => [row.id, row.amounts.length])).toEqual([[1, 2], [3, 1]]);
  });
  for (const voucher_type of ["قبض", "صرف"]) it(`keeps ${voucher_type} balances separate, counted once`, () => {
    const base = { the_number: 8, the_date: "2026-10-28", cash_name: null, notes: null, created_at: "2026-10-28T20:00:00Z", voucher_type };
    const lines = voucherLines([{ ...base, id: 1, currency_id: 1, amount: 100 }, { ...base, id: 2, currency_id: 2, amount: 50000 }]);
    expect(withRunningBalance(lines, 1).balance).toBe(voucher_type === "صرف" ? 100 : -100);
    expect(withRunningBalance(lines, 2).balance).toBe(voucher_type === "صرف" ? 50000 : -50000);
  });
});