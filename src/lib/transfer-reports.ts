/** قواعد تقارير الحوالات: حسابات نقية تُطبق على صفوف الحوالات المقروءة من القاعدة. */
import { adenDate } from "@/lib/closing";

export type ReportRow = {
  dir: "outgoing" | "incoming";
  id: number;
  document_number: number | null;
  the_date: string;
  created_at: string;
  amount: number | string;
  currency_id: number | null;
  sender_name: string;
  receiver_name: string;
  delivered: boolean;
  canceled: boolean;
  delivered_at?: string | null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** الأرقام الناقصة في تسلسل أرقام السندات بين أصغر وأكبر رقم موجود. */
export function missingNumbers(numbers: readonly (number | null)[]): number[] {
  const set = new Set(numbers.filter((n): n is number => n != null && n > 0));
  if (set.size === 0) return [];
  const min = Math.min(...set);
  const max = Math.max(...set);
  const out: number[] = [];
  for (let n = min; n <= max; n++) if (!set.has(n)) out.push(n);
  return out;
}

/** الحوالات المكررة: نفس الاتجاه والمرسل والمستلم والمبلغ والعملة واليوم، وغير ملغاة. */
export function duplicateGroups<T extends ReportRow>(rows: readonly T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (r.canceled) continue;
    const key = [r.dir, norm(r.sender_name), norm(r.receiver_name), Number(r.amount), r.currency_id ?? 0, r.the_date].join("|");
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

/** عمر الحوالة بالأيام: من تاريخها حتى صرفها، أو حتى اليوم إن لم تُصرف. */
export function ageDays(r: Pick<ReportRow, "the_date" | "delivered_at">, today = adenDate()): number {
  const end = r.delivered_at ? adenDate(r.delivered_at) : today;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(r.the_date)) / 86_400_000));
}

/** اختلف تاريخ الحوالة المكتوب عن يوم إدخالها الفعلي (بتوقيت عدن). */
export function dateDiffers(r: Pick<ReportRow, "the_date" | "created_at">): boolean {
  return adenDate(r.created_at) !== r.the_date;
}

/** إجمالي المبلغ والعدد لكل عملة، ولكل يوم إن طُلب. الملغاة لا تدخل. */
export function totalsBy(rows: readonly ReportRow[], byDay: boolean) {
  const map = new Map<string, { day: string; currency_id: number | null; count: number; amount: number }>();
  for (const r of rows) {
    if (r.canceled) continue;
    const day = byDay ? r.the_date : "";
    const key = `${day}|${r.currency_id ?? 0}`;
    const t = map.get(key) ?? { day, currency_id: r.currency_id, count: 0, amount: 0 };
    t.count += 1;
    t.amount += Number(r.amount);
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day) || (a.currency_id ?? 0) - (b.currency_id ?? 0));
}
