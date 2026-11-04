import { describe, expect, it } from "vitest";

import { buildJournalVoucher, type JournalVoucherRow } from "@/lib/voucher";

const base: JournalVoucherRow = {
  id: 3,
  the_number: 3,
  the_date: "2026-10-24",
  amount: 2500,
  notes: "توريد مبلغ",
  debit_account: "1101 — صندوق الرئيسي",
  credit_account: "2101 — حساب عميل",
  currency_name: "ريال سعودي",
};

describe("سند قيد بسيط", () => {
  it("يعرض الحساب المدين والدائن والمبلغ", () => {
    const model = buildJournalVoucher(base, "حمزة");
    expect(model.kind).toBe("journal");
    expect(model.title).toBe("سند قيد بسيط");
    expect(model.number).toBe("3");
    const labels = model.rows.map((r) => r.label);
    expect(labels).toContain("الحساب المدين");
    expect(labels).toContain("الحساب الدائن");
    const amount = model.rows.find((r) => r.label === "المبلغ");
    expect(amount?.value).toContain("2,500");
    expect(model.staff).toBe("حمزة");
  });

  it("البيان يظهر فقط عند وجوده", () => {
    expect(buildJournalVoucher({ ...base, notes: null }, "").rows.some((r) => r.label === "البيان")).toBe(false);
    expect(buildJournalVoucher(base, "").rows.some((r) => r.label === "البيان")).toBe(true);
  });
});
