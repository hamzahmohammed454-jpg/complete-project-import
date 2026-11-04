// Standard money-exchange chart of accounts for the «أبو الياس» phone database.
// Only missing account numbers are added (existing and imported accounts are
// never renamed or moved), and it runs once per phone so deleted accounts stay deleted.
import type { PGlite } from "@electric-sql/pglite";
import { getMeta, setMeta } from "./engine";

type Row = [number, string, number | null, "رئيسي" | "فرعي"];

export const EXCHANGE_CHART: Row[] = [
  [1, "الأصول", null, "رئيسي"],
  [11, "النقدية والصناديق", 1, "رئيسي"],
  [12, "البنوك", 1, "رئيسي"],
  [13, "الوكلاء والمراسلون", 1, "رئيسي"],
  [14, "العملاء", 1, "رئيسي"],
  [15, "ذمم الموظفين", 1, "رئيسي"],
  [16, "شيكات تحت التحصيل", 1, "رئيسي"],
  [17, "سلف وعهد", 1, "رئيسي"],
  [18, "الأصول الثابتة", 1, "رئيسي"],
  [1801, "أثاث ومعدات", 18, "فرعي"],
  [1802, "أجهزة حاسوب وطابعات", 18, "فرعي"],
  [1803, "خزائن وآلات عد النقود", 18, "فرعي"],
  [19, "مصروفات مدفوعة مقدمًا", 1, "رئيسي"],
  [2, "الخصوم", null, "رئيسي"],
  [21, "حوالات واردة تحت التسليم", 2, "رئيسي"],
  [22, "حوالات صادرة تحت التسوية", 2, "رئيسي"],
  [23, "أمانات العملاء", 2, "رئيسي"],
  [24, "شيكات صادرة مستحقة", 2, "رئيسي"],
  [25, "مستحقات الموظفين", 2, "رئيسي"],
  [26, "مصروفات مستحقة", 2, "رئيسي"],
  [27, "رسوم وضرائب مستحقة", 2, "رئيسي"],
  [3, "حقوق الملكية", null, "رئيسي"],
  [31, "رأس المال", 3, "رئيسي"],
  [32, "الأرباح والخسائر المرحلة", 3, "رئيسي"],
  [34, "جاري المالك", 3, "رئيسي"],
  [35, "الاحتياطيات", 3, "رئيسي"],
  [4, "الإيرادات", null, "رئيسي"],
  [41, "عمولات الحوالات", 4, "رئيسي"],
  [42, "أرباح بيع وشراء العملات", 4, "رئيسي"],
  [44, "فروق أسعار العملات", 4, "رئيسي"],
  [45, "زيادة الجرد", 4, "رئيسي"],
  [46, "إيرادات أخرى", 4, "رئيسي"],
  [5, "المصروفات", null, "رئيسي"],
  [51, "مصروفات تشغيلية", 5, "رئيسي"],
  [5101, "الإيجار", 51, "فرعي"],
  [5102, "الكهرباء والماء", 51, "فرعي"],
  [5103, "الاتصالات والإنترنت", 51, "فرعي"],
  [5104, "القرطاسية والمطبوعات", 51, "فرعي"],
  [5105, "الصيانة", 51, "فرعي"],
  [5106, "الضيافة والنظافة", 51, "فرعي"],
  [5107, "النقل والمواصلات", 51, "فرعي"],
  [52, "الرواتب والأجور", 5, "رئيسي"],
  [5201, "الرواتب", 52, "فرعي"],
  [5202, "المكافآت والحوافز", 52, "فرعي"],
  [53, "عمولات الوكلاء المدفوعة", 5, "رئيسي"],
  [54, "فروق الجرد", 5, "فرعي"],
  [56, "رسوم وعمولات بنكية", 5, "رئيسي"],
  [57, "خسائر فروق العملات", 5, "رئيسي"],
  [58, "رسوم حكومية وتراخيص", 5, "رئيسي"],
  [59, "إهلاك الأصول الثابتة", 5, "رئيسي"],
];

/** Adds missing chart accounts. Returns how many were added. */
export async function ensureExchangeChart(pg: PGlite, force = false): Promise<number> {
  if (!force && (await getMeta(pg, "chart_v1"))) return 0;
  let added = 0;
  await pg.transaction(async (tx) => {
    const have = new Set((await tx.query<{ n: number }>("select account_number::bigint n from public.accounts")).rows.map((r) => Number(r.n)));
    for (const [n, name, father, type] of EXCHANGE_CHART) {
      if (have.has(n) || (father != null && !have.has(father))) continue;
      await tx.query("insert into public.accounts(account_number, father_number, account_name, account_type) values ($1, $2, $3, $4)", [n, father, name, type]);
      have.add(n);
      added++;
    }
    await setMeta(tx, "chart_v1", true);
  });
  return added;
}
