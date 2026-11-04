import * as XLSX from "xlsx";

/** ورقة واحدة في النسخة الاحتياطية: اسم عربي قصير وأسطر الجدول كما هي. */
export type BackupSheet = { name: string; rows: Record<string, unknown>[] };

/** يبني مصنّف Excel بورقة لكل جدول، باتجاه عربي. أسماء الأوراق تُقصّ إلى 31 حرفًا (حد Excel). */
export function tablesToWorkbook(sheets: readonly BackupSheet[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  wb.Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function backupFilename(date: string): string {
  return `نسخة احتياطية - ${date}.xlsx`;
}
