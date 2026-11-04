export type CustomerImportRow = { row: number; full_name: string; phone_number: string; client_ref: string; issues: string[]; warnings: string[] };
const digits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(d) : "۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
export function previewCustomerImport(rows: readonly unknown[][], refs: readonly string[]): CustomerImportRow[] {
  const header = (rows[0] ?? []).map((v) => String(v ?? "").trim().toLowerCase());
  const nameCol = header.findIndex((v) => ["الاسم", "الاسم الكامل", "اسم العميل", "full_name", "name"].includes(v));
  const phoneCol = header.findIndex((v) => ["الهاتف", "رقم الهاتف", "الجوال", "phone", "phone_number"].includes(v));
  if (nameCol < 0) throw new Error("عمود اسم العميل غير موجود");
  const seen = new Set<string>();
  return rows.slice(1).flatMap((row, i) => {
    if (row.every((v) => v == null || String(v).trim() === "")) return [];
    const rawPhone = phoneCol < 0 ? "" : row[phoneCol];
    const phone_number = digits(String(rawPhone ?? "").trim()).replace(/[\s()-]/g, "");
    const full_name = String(row[nameCol] ?? "").trim();
    const issues: string[] = []; const warnings: string[] = [];
    if (!full_name) issues.push("الاسم مطلوب");
    if (phone_number && !/^\+?\d{5,20}$/.test(phone_number)) issues.push("رقم الهاتف غير صالح");
    if (phone_number && seen.has(phone_number)) issues.push("الهاتف مكرر في الملف");
    if (phone_number) seen.add(phone_number);
    if (typeof rawPhone === "number") warnings.push("الهاتف رقمي في Excel؛ تحقق من الصفر في بدايته");
    const client_ref = refs[i] ?? "";
    if (!client_ref) issues.push("تعذّر إعداد مرجع الاستيراد");
    return [{ row: i + 2, full_name, phone_number, client_ref, issues, warnings }];
  });
}