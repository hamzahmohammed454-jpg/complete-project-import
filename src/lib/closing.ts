/** تاريخ اليوم بتوقيت عدن (YYYY-MM-DD) — نفس اليوم الذي تحسبه القاعدة في الإقفال. */
export function adenDate(value: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(value),
  );
}

export type DaySummary = { opening: number; receipts: number; payments: number; closing: number };

type SummaryRow = {
  box_id: number;
  currency_id: number | null;
  opening: number | string;
  receipts: number | string;
  payments: number | string;
  closing: number | string;
};

/** صفوف box_day_summary من القاعدة → خريطة مفتاحها "box|currency". */
export function toSummaryMap(rows: readonly SummaryRow[]): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>();
  for (const r of rows) {
    map.set(`${r.box_id}|${r.currency_id ?? 0}`, {
      opening: Number(r.opening),
      receipts: Number(r.receipts),
      payments: Number(r.payments),
      closing: Number(r.closing),
    });
  }
  return map;
}
