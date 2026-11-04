import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { backupFilename, tablesToWorkbook } from "@/lib/backup";

describe("tablesToWorkbook", () => {
  it("يبني ورقة لكل جدول بأسمائها وبالاتجاه العربي", () => {
    const buf = tablesToWorkbook([
      { name: "العملاء", rows: [{ id: 1, customer_name: "أحمد" }] },
      { name: "العملات", rows: [{ id: 1, currency_name: "ريال يمني" }] },
    ]);
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames).toEqual(["العملاء", "العملات"]);
    expect(wb.Workbook?.Views?.[0]?.RTL).toBe(true);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["العملاء"]!);
    expect(rows).toEqual([{ id: 1, customer_name: "أحمد" }]);
  });

  it("يقصّ اسم الورقة الطويل إلى 31 حرفًا", () => {
    const long = "جدول باسم طويل جدًا يتجاوز الحد المسموح به في إكسل";
    const buf = tablesToWorkbook([{ name: long, rows: [] }]);
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames[0]!.length).toBeLessThanOrEqual(31);
  });

  it("الجدول الفارغ يخرج بورقة فارغة لا بخطأ", () => {
    const buf = tablesToWorkbook([{ name: "فارغ", rows: [] }]);
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames).toEqual(["فارغ"]);
  });
});

describe("backupFilename", () => {
  it("يحمل التاريخ", () => {
    expect(backupFilename("2026-10-26")).toBe("نسخة احتياطية - 2026-10-26.xlsx");
  });
});
