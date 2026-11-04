/** أنواع الإقفال المحاسبي كما تُحفظ في قاعدة البيانات. */
export const PERIOD_TYPES = ["يومي", "أسبوعي", "شهري", "سنوي"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

/**
 * يقترح مدى الفترة حسب نوعها انتهاءً بتاريخ معطى (YYYY-MM-DD):
 * يومي = اليوم نفسه، أسبوعي = آخر ٧ أيام، شهري = من أول الشهر، سنوي = من أول السنة.
 */
export function suggestRange(type: PeriodType, end: string): { from: string; to: string } {
  const d = new Date(end + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (type) {
    case "يومي":
      return { from: end, to: end };
    case "أسبوعي": {
      const start = new Date(d);
      start.setUTCDate(start.getUTCDate() - 6);
      return { from: iso(start), to: end };
    }
    case "شهري":
      return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: end };
    case "سنوي":
      return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), 0, 1))), to: end };
  }
}
