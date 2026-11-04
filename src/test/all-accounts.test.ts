import { describe, expect, it } from "vitest";

import { filterBySide, partyNetBalances, totalsByCurrency, type AllAccountsInput } from "@/lib/all-accounts";

const base: AllAccountsInput = {
  customers: [{ kind: "customer", id: 1, name: "عميل أ", num: 5, account_id: 100 }],
  agents: [{ kind: "agent", id: 2, name: "وكيل ب", num: 7, account_id: 200 }],
  vouchers: [],
  checks: [],
  outgoing: [],
  incoming: [],
  settlements: [],
  entries: [],
};

describe("partyNetBalances", () => {
  it("سند صرف للعميل يجعله مدينًا وسند قبض يجعله دائنًا", () => {
    const rows = partyNetBalances(
      {
        ...base,
        vouchers: [
          { customer_id: 1, voucher_type: "صرف", amount: 1000, currency_id: 1, the_date: "2026-10-01" },
          { customer_id: 1, voucher_type: "قبض", amount: 400, currency_id: 1, the_date: "2026-10-02" },
        ],
      },
      "",
      "2026-10-31",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "customer", id: 1, currency_id: 1, net: 600 });
  });

  it("حوالة واردة من الوكيل عليه، وصادرة عبره له، والملغاة لا تُحسب", () => {
    const rows = partyNetBalances(
      {
        ...base,
        incoming: [{ agent_id: 2, amount: 500, currency_id: 1, the_date: "2026-10-01", canceled: false }],
        outgoing: [
          { agent_id: 2, amount: 200, currency_id: 1, the_date: "2026-10-01", canceled: false },
          { agent_id: 2, amount: 999, currency_id: 1, the_date: "2026-10-01", canceled: true },
        ],
      },
      "",
      "2026-10-31",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "agent", id: 2, net: 300 });
  });

  it("الشيك تحت التحصيل لا يدخل، والمحصل يدخل بتاريخ التحصيل", () => {
    const rows = partyNetBalances(
      {
        ...base,
        checks: [
          { customer_id: 1, check_type: "وارد", status: "تحت التحصيل", amount: 700, currency_id: 1, the_date: "2026-10-01", collected_date: null },
          { customer_id: 1, check_type: "وارد", status: "محصل", amount: 300, currency_id: 1, the_date: "2026-09-01", collected_date: "2026-10-05" },
        ],
      },
      "",
      "2026-10-31",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.net).toBe(-300); // وارد محصل ← له (دائن)
  });

  it("قيود حساب الطرف تدخل صافيه، وقيود الحسابات الأخرى لا تدخل", () => {
    const rows = partyNetBalances(
      {
        ...base,
        entries: [
          { account_id: 100, side: "مدين", amount: 250, currency_id: 1, the_date: "2026-10-01" },
          { account_id: 999, side: "مدين", amount: 5000, currency_id: 1, the_date: "2026-10-01" },
        ],
      },
      "",
      "2026-10-31",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "customer", id: 1, net: 250 });
  });

  it("الفترة تحدّ الحركات: «من يوم» و«حتى يوم»", () => {
    const rows = partyNetBalances(
      {
        ...base,
        vouchers: [
          { customer_id: 1, voucher_type: "صرف", amount: 100, currency_id: 1, the_date: "2026-09-30" },
          { customer_id: 1, voucher_type: "صرف", amount: 200, currency_id: 1, the_date: "2026-10-10" },
          { customer_id: 1, voucher_type: "صرف", amount: 400, currency_id: 1, the_date: "2026-10-20" },
        ],
      },
      "2026-10-01",
      "2026-10-15",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.net).toBe(200);
  });

  it("الطرف المتوازن (صفر) لا يظهر في التقرير", () => {
    const rows = partyNetBalances(
      {
        ...base,
        vouchers: [
          { customer_id: 1, voucher_type: "صرف", amount: 500, currency_id: 1, the_date: "2026-10-01" },
          { customer_id: 1, voucher_type: "قبض", amount: 500, currency_id: 1, the_date: "2026-10-02" },
        ],
      },
      "",
      "2026-10-31",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("filterBySide و totalsByCurrency", () => {
  const rows = partyNetBalances(
    {
      ...base,
      vouchers: [{ customer_id: 1, voucher_type: "صرف", amount: 800, currency_id: 1, the_date: "2026-10-01" }],
      incoming: [{ agent_id: 2, amount: 300, currency_id: 1, the_date: "2026-10-01", canceled: false }],
      settlements: [{ agent_id: 2, amount: 1000, currency_id: 1, direction: "received_from_agent", the_date: "2026-10-02" }],
    },
    "",
    "2026-10-31",
  );

  it("المدينون صافيهم موجب والدائنون صافيهم سالب", () => {
    expect(filterBySide(rows, "debtors").map((r) => r.name)).toEqual(["عميل أ"]);
    expect(filterBySide(rows, "creditors").map((r) => r.name)).toEqual(["وكيل ب"]);
    expect(filterBySide(rows, "all")).toHaveLength(2);
  });

  it("الإجماليات تجمع المدين والدائن لكل عملة", () => {
    const t = totalsByCurrency(rows).get(1)!;
    expect(t.debit).toBe(800);
    expect(t.credit).toBe(700); // وكيل ب: 300 − 1000 = −700
  });
});
