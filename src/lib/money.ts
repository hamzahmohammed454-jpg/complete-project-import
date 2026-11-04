/**
 * تنسيق موحّد للأرقام في كل الشاشات: أرقام لاتينية بفواصل آلاف،
 * وبلا أصفار زائدة. الصفر يظهر «0» دائمًا (لا نقطة فارغة).
 */
export function fmt(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** مبلغ مع اسم العملة: 25,000 ريال يمني */
export function fmtMoney(n: number | string | null | undefined, currencyName?: string | null, digits = 2): string {
  const base = fmt(n, digits);
  return currencyName ? `${base} ${currencyName}` : base;
}

/** مبلغ موجّه بعلامة: +25,000 / −25,000 */
export function fmtSigned(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return fmt(0, digits);
  return `${v > 0 ? "+" : "−"}${fmt(Math.abs(v), digits)}`;
}

/** وقت موحّد: 2026-10-24 22:31 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
