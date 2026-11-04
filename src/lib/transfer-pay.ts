/** منطق شاشة صرف الحوالات بنمط النظام القديم: إيجاد الحوالة المعلقة، والقائمة المصروفة تحت النموذج حسب التاريخ المحدد. */

export type PayRow = {
  id: number;
  document_number: number | null;
  transfer_number: number | null;
  reference_number: string | null;
  the_date: string;
  amount: number | string;
  delivered: boolean | null;
  canceled: boolean | null;
  receiver_name: string;
  sender_name: string;
};

/** الحوالة القابلة للصرف: لم تُسلَّم ولم تُلغَ. */
export function isPayable(t: Pick<PayRow, "delivered" | "canceled">): boolean {
  return !t.delivered && !t.canceled;
}

/** النص الذي يُبحث فيه عند «إيجاد حوالة»: رقم السند ورقم الحوالة والمرجع والاسمين. */
export function payRowSearchText(t: Pick<PayRow, "document_number" | "transfer_number" | "reference_number" | "receiver_name" | "sender_name">): string {
  return [t.document_number, t.transfer_number, t.reference_number, t.receiver_name, t.sender_name]
    .filter((x) => x != null && String(x).trim() !== "")
    .join(" ");
}

/** البحث في اختيار الحوالة حسب الإعداد: «البحث يحتوي» افتراضيًا، أو «البحث يبدأ بـ». */
export function chooserMatch(needle: string, haystack: string, mode: string | boolean): boolean {
  const n = needle.trim();
  if (!n) return true;
  return mode === "البحث يبدأ بـ" ? haystack.startsWith(n) : haystack.includes(n);
}

/** تصفية القائمة المصروفة بحسب التاريخ المحدد (من — إلى)، فلا يظهر تحت النموذج إلا مدى اليوم/الفترة المختار. */
export function filterPayByDate<T extends Pick<PayRow, "the_date">>(rows: readonly T[], from: string, until: string): T[] {
  return rows.filter((t) => (!from || t.the_date >= from) && (!until || t.the_date <= until));
}
