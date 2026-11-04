/**
 * شجرة صلاحيات المجموعة: أقسام النظام ← الشاشات ← العمليات.
 * كل شاشة في SCREENS تظهر في قسم واحد فقط، والحفظ يكتب صفًا واحدًا لكل شاشة.
 */
import { SCREENS } from "./screen-access";
import { screenActions } from "./screen-actions";
import type { ScreenPermission } from "./permissions";

export type TreeSection = { id: string; label: string; screens: readonly string[] };

export const PERMISSION_TREE: readonly TreeSection[] = [
  { id: "general", label: "عام", screens: ["/news", "/alerts", "/statistics", "/daily-report", "/cash-position", "/exceptions"] },
  { id: "transfers", label: "الحوالات", screens: ["/transfers", "/transfer-requests", "/transfer-setup", "/commissions", "/transfer-reports", "/totals"] },
  { id: "exchange", label: "البيع والشراء", screens: ["/exchange", "/currencies", "/exchange-reports", "/profits"] },
  {
    id: "ledger",
    label: "الحسابات",
    screens: ["/accounts", "/customers", "/agents", "/boxes", "/vouchers", "/withdrawal-requests", "/journal", "/entries", "/checks", "/banks", "/check-books", "/funds-inventory", "/bank-accounts", "/cost-centers", "/loop-entries", "/financial-years", "/closing", "/period-closing", "/statement", "/reports", "/financials"],
  },
  { id: "security", label: "الأمان", screens: ["/staff", "/setup"] },
  { id: "admin", label: "الأدوات الإدارية", screens: ["/activity", "/backup", "/auto-reply", "/wa-bot", "/license", "/system-settings"] },
];

/** شاشات لا تُمنح للمجموعات أبدًا (التفعيل للمدير فقط). */
export const LOCKED_SCREENS: readonly string[] = ["/license"];

export const screenLabel = (path: string) => SCREENS.find((s) => s.to === path)?.label ?? path;

export type PermKey = { key: string; label: string };
const BASIC: readonly PermKey[] = [
  { key: "view", label: "عرض" },
  { key: "create", label: "إضافة" },
  { key: "update", label: "تعديل" },
  { key: "delete", label: "حذف" },
  { key: "print", label: "طباعة" },
];

/** مفاتيح الصلاحيات لشاشة: الأساسية ثم أزرارها الخاصة بمفتاح x:<key>. */
export function permKeys(path: string): readonly PermKey[] {
  return [...BASIC, ...screenActions(path).map((a) => ({ key: `x:${a.key}`, label: a.label }))];
}

/** الصف الافتراضي عند عدم وجود صف محفوظ: يتبع قائمة الشاشات المسموحة للمجموعة. */
export function defaultRow(path: string, allowed: readonly string[]): ScreenPermission {
  const on = allowed.length === 0 || allowed.includes(path);
  return { screen_path: path, can_view: on, can_create: on, can_update: on, can_delete: on, can_print: on, extra_actions: {} };
}

export function isOn(row: ScreenPermission, key: string): boolean {
  if (!row.can_view) return false;
  if (key.startsWith("x:")) return row.extra_actions?.[key.slice(2)] ?? true;
  return row[`can_${key}` as "can_view"];
}

/** تشغيل/إيقاف مفتاح واحد: إيقاف العرض يوقف الكل، وتشغيل أي عملية يشغّل العرض. */
export function setKey(row: ScreenPermission, key: string, on: boolean): ScreenPermission {
  if (key === "view") return on ? { ...row, can_view: true } : setAll(row, false);
  const next: ScreenPermission = { ...row, extra_actions: { ...(row.extra_actions ?? {}) } };
  if (key.startsWith("x:")) next.extra_actions![key.slice(2)] = on;
  else next[`can_${key}` as "can_create"] = on;
  if (on) next.can_view = true;
  return next;
}

export function setAll(row: ScreenPermission, on: boolean): ScreenPermission {
  const extras = Object.fromEntries(screenActions(row.screen_path).map((a) => [a.key, on]));
  return { ...row, can_view: on, can_create: on, can_update: on, can_delete: on, can_print: on, extra_actions: extras };
}

export type CheckState = "all" | "none" | "some";

export function stateOf(rows: readonly ScreenPermission[]): CheckState {
  let on = 0;
  let total = 0;
  for (const row of rows) {
    for (const k of permKeys(row.screen_path)) {
      total += 1;
      if (isOn(row, k.key)) on += 1;
    }
  }
  if (total === 0 || on === 0) return "none";
  return on === total ? "all" : "some";
}

/** هل يختلف الصفان في أي صلاحية فعلية؟ */
export function sameRow(a: ScreenPermission, b: ScreenPermission): boolean {
  return permKeys(a.screen_path).every((k) => isOn(a, k.key) === isOn(b, k.key));
}

export type GroupSource = { allowed_screens: readonly string[]; rows: readonly ScreenPermission[] };

/**
 * صلاحية الموظف من مجموعاته فقط (قبل صلاحياته الخاصة): بلا مجموعة = كل شيء،
 * ومع عدة مجموعات تكفي أي مجموعة تسمح. نفس قاعدة قاعدة البيانات.
 */
export function groupEffectiveRow(path: string, groups: readonly GroupSource[]): ScreenPermission {
  if (groups.length === 0) return setAll(defaultRow(path, []), true);
  const rows = groups.map((g) => g.rows.find((r) => r.screen_path === path) ?? defaultRow(path, g.allowed_screens));
  let out = setAll(defaultRow(path, []), false);
  for (const k of permKeys(path)) if (rows.some((r) => isOn(r, k.key))) out = setKey(out, k.key, true);
  return out;
}

/** الصلاحية النهائية للموظف: صفه الخاص يحل محل نتيجة المجموعات لتلك الشاشة. */
export function userEffectiveRow(path: string, personal: readonly ScreenPermission[], groups: readonly GroupSource[]): ScreenPermission {
  return personal.find((r) => r.screen_path === path) ?? groupEffectiveRow(path, groups);
}
