import { describe, expect, it } from "vitest";

import { amountInWords, tafeesh } from "@/lib/tafteesh";
import { buildExchangeVoucher, buildTransferVoucher, voucherToText } from "@/lib/voucher";

const transfer = {
  id: 7,
  transfer_number: 3,
  amount: 50000,
  the_date: "2026-10-23",
  sender_name: "أحمد",
  sender_phone: "777111222",
  receiver_name: "محمد",
  receiver_phone: null,
  state: "معلقة",
  delivered: false,
  canceled: false,
  branch_commission: 500,
  notes: null,
  currency_name: "ريال يمني",
  commission_currency_name: null,
  agent_name: "وكيل المكلا",
};

const exchange = {
  id: 4,
  the_number: null,
  amount: 100,
  price: 420,
  exchange_amount: 42000,
  the_date: "2026-10-23",
  cash_customer_name: null,
  customer_phone: "733",
  notes: null,
  currency_name: "دولار أمريكي",
  exchange_currency_name: "ريال يمني",
};

describe("tafeesh", () => {
  it("spells whole amounts", () => {
    expect(tafeesh(0)).toBe("صفر");
    expect(tafeesh(1)).toBe("واحد");
    expect(tafeesh(11)).toBe("أحد عشر");
    expect(tafeesh(1000)).toBe("ألف");
    expect(tafeesh(2000)).toBe("ألفان");
    expect(tafeesh(1500)).toBe("ألف و خمسمئة");
    expect(tafeesh(50000)).toBe("خمسون ألف");
    expect(tafeesh(2000000)).toBe("مليونان");
  });

  it("writes the official voucher phrase with the currency", () => {
    expect(amountInWords(50000, "ريال يمني")).toBe("فقط وقدره خمسون ألف ريال يمني لا غير");
    expect(amountInWords(100, "دولار أمريكي")).toBe("فقط وقدره مئة دولار أمريكي لا غير");
  });
});

describe("buildTransferVoucher", () => {
  const model = buildTransferVoucher("outgoing", transfer, "admin");

  it("uses the transfer number and its own title", () => {
    expect(model.title).toBe("سند حوالة صادرة");
    expect(model.number).toBe("3");
    expect(model.date).toBe("2026-10-23");
  });

  it("shows amount, commission and state", () => {
    expect(model.rows.find((r) => r.label === "المبلغ")?.value).toBe("50,000 ريال يمني");
    expect(model.rows.find((r) => r.label === "العمولة")?.value).toBe("500 ريال يمني");
    expect(model.rows.find((r) => r.label === "الحالة")?.value).toBe("معلقة");
    expect(model.rows.find((r) => r.label === "الوكيل")?.value).toBe("وكيل المكلا");
  });

  it("marks a canceled transfer as canceled", () => {
    const canceled = buildTransferVoucher("incoming", { ...transfer, canceled: true }, "admin");
    expect(canceled.title).toBe("سند حوالة واردة");
    expect(canceled.rows.find((r) => r.label === "الحالة")?.value).toBe("ملغاة");
  });
});

describe("buildExchangeVoucher", () => {
  const model = buildExchangeVoucher("buy", exchange, "sara");

  it("falls back to the row id when no reference number exists", () => {
    expect(model.title).toBe("سند شراء عملة");
    expect(model.number).toBe("4");
  });

  it("labels an unnamed buyer as a cash customer and totals in the other currency", () => {
    expect(model.rows.find((r) => r.label === "الزبون")?.value).toBe("زبون نقدي");
    expect(model.rows.find((r) => r.label === "الإجمالي")?.value).toBe("42,000 ريال يمني");
    expect(model.rows.find((r) => r.label === "السعر")?.value).toBe("420");
    expect(model.amountWords).toBe("فقط وقدره مئة دولار أمريكي لا غير");
  });
});

describe("voucherToText", () => {
  it("builds a shareable text starting with the title and carrying the staff name", () => {
    const text = voucherToText(buildTransferVoucher("outgoing", transfer, "admin"));
    expect(text.split("\n").slice(0, 3)).toEqual(["سند حوالة صادرة", "رقم: 3", "التاريخ: 2026-10-23"]);
    expect(text).toContain("المرسل: أحمد");
    expect(text).toContain("فقط وقدره خمسون ألف ريال يمني لا غير");
    expect(text).toContain("الموظف: admin");
  });
});

describe("voucher title by payment method", () => {
  it("account-funded outgoing transfer prints a debit notice", () => {
    expect(buildTransferVoucher("outgoing", { ...transfer, payment_method: "account" }, "a").title).toBe("إشعار مدين");
  });
  it("account incoming transfer prints a credit notice", () => {
    expect(buildTransferVoucher("incoming", { ...transfer, payment_method: "account" }, "a").title).toBe("إشعار دائن");
  });
  it("cash transfer keeps its own voucher title", () => {
    expect(buildTransferVoucher("outgoing", { ...transfer, payment_method: "cash" }, "a").title).toBe("سند حوالة صادرة");
  });
  it("account sell prints debit notice, account buy prints credit notice", () => {
    expect(buildExchangeVoucher("sell", { ...exchange, account_id: 5 }, "a").title).toBe("إشعار مدين");
    expect(buildExchangeVoucher("buy", { ...exchange, account_id: 5 }, "a").title).toBe("إشعار دائن");
  });
  it("cash buy keeps the buy voucher title", () => {
    expect(buildExchangeVoucher("buy", { ...exchange, account_id: null }, "a").title).toBe("سند شراء عملة");
  });
});
