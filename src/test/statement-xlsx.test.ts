import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { statementFilename, statementToArrayBuffer, summaryToArrayBuffer } from "@/lib/statement-xlsx";

function readFirstSheet(buf: ArrayBuffer) {
  const wb = XLSX.read(buf, { type: "array" });
  const name = wb.SheetNames[0] ?? "";
  return { name, rows: XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name] ?? {}, { header: 1 }) };
}

describe("تصدير كشف الحساب إلى Excel", () => {
  const input = {
    partyLabel: "كشف حساب العميل: عميل تجريبي",
    partyNumber: 7,
    period: "من 2026-10-01 حتى 2026-10-26",
    currencyName: "ريال يمني",
    opening: 5000,
    rows: [
      { description: "سند قبض 1 — دفعة", date: "2026-10-02", debit: 50000, credit: 0, balance: 55000 },
      { description: "سند صرف 2 — مستحق", date: "2026-10-05", debit: 0, credit: 20000, balance: 35000 },
    ],
    totalDebit: 50000,
    totalCredit: 20000,
    balanceSentence: "الرصيد لكم خمسة وثلاثون ألف ريال يمني",
  };

  it("يبدأ الملف باسم الطرف والفترة والعملة", () => {
    const { name, rows } = readFirstSheet(statementToArrayBuffer(input));
    expect(name).toBe("كشف الحساب");
    expect(rows[0]?.[0]).toBe("كشف حساب العميل: عميل تجريبي");
    expect(rows[1]?.[0]).toContain("من 2026-10-01 حتى 2026-10-26");
    expect(rows[1]?.[1]).toContain("ريال يمني");
    expect(rows[1]?.[2]).toContain("7");
  });

  it("يتضمن عناوين الأعمدة والحركات والرصيد السابق والإجمالي", () => {
    const { rows } = readFirstSheet(statementToArrayBuffer(input));
    expect(rows[3]).toEqual(["البيان", "التاريخ", "مدين", "دائن", "الرصيد"]);
    expect(rows[4]).toEqual(["رصيد سابق", "", 0, 0, 5000]);
    expect(rows[5]).toEqual(["سند قبض 1 — دفعة", "2026-10-02", 50000, 0, 55000]);
    expect(rows[6]).toEqual(["سند صرف 2 — مستحق", "2026-10-05", 0, 20000, 35000]);
    expect(rows[7]).toEqual(["الإجمالي", "", 50000, 20000, ""]);
    expect(rows[9]?.[0]).toContain("الرصيد لكم");
  });

  it("يصدّر الكشف الإجمالي بكل العملات مع المقابل بالعملة المحلية", () => {
    const { rows } = readFirstSheet(
      summaryToArrayBuffer({
        partyLabel: "كشف حساب الوكيل: وكيل تجريبي",
        partyNumber: null,
        period: "حتى 2026-10-26",
        localName: "ريال يمني",
        rows: [
          { currency: "دولار", debit: 100, credit: 40, equivDebit: 150000, equivCredit: 60000, balanceText: "الرصيد لكم 60 دولار" },
        ],
        totalEquivDebit: 150000,
        totalEquivCredit: 60000,
        balanceSentence: "الرصيد لكم تسعون ألف ريال يمني",
      }),
    );
    expect(rows[3]).toEqual(["العملة", "مدين", "دائن", "مقابل مدين (ريال يمني)", "مقابل دائن (ريال يمني)", "الرصيد"]);
    expect(rows[4]).toEqual(["دولار", 100, 40, 150000, 60000, "الرصيد لكم 60 دولار"]);
    expect(rows[5]).toEqual(["الإجمالي", "", "", 150000, 60000, ""]);
  });

  it("يسمّي الملف باسم الطرف وتاريخ نهاية الفترة", () => {
    expect(statementFilename("عميل تجريبي", "2026-10-26")).toBe("كشف حساب - عميل تجريبي - 2026-10-26.xlsx");
    expect(statementFilename("أ/ب:ج", "2026-10-26")).toBe("كشف حساب - أ-ب-ج - 2026-10-26.xlsx");
  });
});
