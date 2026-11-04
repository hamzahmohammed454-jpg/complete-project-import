import * as XLSX from "xlsx";

import type { StatementLine } from "@/lib/statement";

export type StatementRow = {
  description: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StatementXlsxInput = {
  partyLabel: string; // «كشف حساب العميل: فلان»
  partyNumber: number | null;
  period: string; // «من 2026-10-01 حتى 2026-10-26» أو «حتى 2026-10-26»
  currencyName: string;
  opening: number | null; // رصيد سابق عند تحديد «من يوم»
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  balanceSentence: string;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sheetFromAoa(aoa: (string | number)[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

function workbookWith(ws: XLSX.WorkSheet): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
  // ورقة عربية: الاتجاه من اليمين لليسار
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}

export function statementToArrayBuffer(input: StatementXlsxInput): ArrayBuffer {
  const head: (string | number)[][] = [
    [input.partyLabel],
    [
      `الفترة: ${input.period}`,
      `العملة: ${input.currencyName}`,
      input.partyNumber ? `الرقم: ${input.partyNumber}` : "",
    ],
    [],
    ["البيان", "التاريخ", "مدين", "دائن", "الرصيد"],
  ];
  const body: (string | number)[][] = [];
  if (input.opening != null) {
    body.push(["رصيد سابق", "", 0, 0, Math.abs(input.opening)]);
  }
  for (const r of input.rows) {
    body.push([r.description, r.date, r.debit, r.credit, Math.abs(r.balance)]);
  }
  body.push(["الإجمالي", "", input.totalDebit, input.totalCredit, ""]);
  body.push([]);
  body.push([input.balanceSentence]);

  const ws = sheetFromAoa([...head, ...body], [42, 12, 14, 14, 16]);
  const out = XLSX.write(workbookWith(ws), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

export type SummaryXlsxInput = {
  partyLabel: string;
  partyNumber: number | null;
  period: string;
  localName: string;
  rows: { currency: string; debit: number; credit: number; equivDebit: number; equivCredit: number; balanceText: string }[];
  totalEquivDebit: number;
  totalEquivCredit: number;
  balanceSentence: string;
};

export function summaryToArrayBuffer(input: SummaryXlsxInput): ArrayBuffer {
  const aoa: (string | number)[][] = [
    [input.partyLabel],
    [`الفترة: ${input.period}`, input.partyNumber ? `الرقم: ${input.partyNumber}` : ""],
    [],
    ["العملة", "مدين", "دائن", `مقابل مدين (${input.localName})`, `مقابل دائن (${input.localName})`, "الرصيد"],
    ...input.rows.map((r) => [r.currency, r.debit, r.credit, r.equivDebit, r.equivCredit, r.balanceText] as (string | number)[]),
    ["الإجمالي", "", "", input.totalEquivDebit, input.totalEquivCredit, ""],
    [],
    [input.balanceSentence],
  ];
  const ws = sheetFromAoa(aoa, [18, 14, 14, 18, 18, 30]);
  const out = XLSX.write(workbookWith(ws), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

export function xlsxBlob(buf: ArrayBuffer): Blob {
  return new Blob([buf], { type: XLSX_MIME });
}

export function statementFilename(partyName: string, until: string): string {
  const safe = partyName.replace(/[\\/:*?"<>|]/g, "-").trim() || "كشف";
  return `كشف حساب - ${safe} - ${until}.xlsx`;
}

export type AllAccountsXlsxInput = {
  period: string;
  filterLabel: string; // «الدائنون والمدينون» إلخ
  rows: { name: string; kindLabel: string; num: number | null; currency: string; debit: number; credit: number }[];
  totals: { currency: string; debit: number; credit: number }[];
};

/** تقرير كافة الحسابات بصيغة Excel: كل طرف ورصيده بكل عملة، مع إجمالي كل عملة. */
export function allAccountsToArrayBuffer(input: AllAccountsXlsxInput): ArrayBuffer {
  const aoa: (string | number)[][] = [
    ["تقرير كافة الحسابات"],
    [`الفترة: ${input.period}`, `الحسابات: ${input.filterLabel}`],
    [],
    ["الاسم", "النوع", "الرقم", "العملة", "مدين (لنا)", "دائن (لهم)"],
    ...input.rows.map((r) => [r.name, r.kindLabel, r.num ?? "", r.currency, r.debit, r.credit] as (string | number)[]),
    [],
    ...input.totals.map((t) => [`إجمالي ${t.currency}`, "", "", "", t.debit, t.credit] as (string | number)[]),
  ];
  const ws = sheetFromAoa(aoa, [26, 10, 10, 14, 16, 16]);
  return XLSX.write(workbookWith(ws), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function allAccountsFilename(until: string): string {
  return `كافة الحسابات - ${until}.xlsx`;
}

export type { StatementLine };
