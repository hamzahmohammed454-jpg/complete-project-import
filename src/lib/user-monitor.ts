/**
 * تقارير «رقابة المستخدمين»: قراءة فقط من سجل العمليات (activity_log)،
 * لا تُنشئ ولا تعدّل أي سجل مالي.
 */
export type LogRow = {
  id: number;
  user_id: string | null;
  username: string | null;
  action: string;
  target: string | null;
  created_at: string;
};

/** عمليات الحفظ على البيانات (إضافة/تعديل/حذف) — «المحفوظات». */
export const SAVE_ACTIONS = ["إضافة", "تعديل", "حذف"] as const;
/** أحداث الجلسة: الدخول والخروج. */
export const SESSION_ACTIONS = ["تسجيل دخول", "دخول", "تسجيل خروج"] as const;

export const MONITOR_REPORTS = [
  { id: "saved", label: "المحفوظات" },
  { id: "by-doc", label: "المحفوظات بحسب المستند ونوع العملية" },
  { id: "last-edit", label: "تقرير مستخدم وتاريخ آخر عمليات التعديل" },
  { id: "monitor", label: "تقرير مراقبة المستخدمين" },
  { id: "works", label: "تقرير أعمال المستخدمين" },
  { id: "sessions", label: "جلسات المستخدمين" },
  { id: "employee", label: "تقرير كافة عمليات الموظف" },
] as const;
export type MonitorReportId = (typeof MONITOR_REPORTS)[number]["id"];
export const isMonitorReport = (v: unknown): v is MonitorReportId => MONITOR_REPORTS.some((r) => r.id === v);

const isSave = (r: LogRow) => (SAVE_ACTIONS as readonly string[]).includes(r.action);
const isSession = (r: LogRow) => (SESSION_ACTIONS as readonly string[]).includes(r.action);
const who = (r: LogRow) => r.username ?? r.user_id ?? "—";

export const savedRows = (rows: readonly LogRow[]) => rows.filter(isSave);
export const sessionRows = (rows: readonly LogRow[]) => rows.filter(isSession);
export const employeeRows = (rows: readonly LogRow[], user: string) => rows.filter((r) => who(r) === user);

/** عدد المحفوظات لكل مستند (جدول) ونوع عملية. */
export function savedByDocument(rows: readonly LogRow[]) {
  const map = new Map<string, { target: string; action: string; count: number }>();
  for (const r of savedRows(rows)) {
    const target = r.target ?? "—";
    const key = `${target}|${r.action}`;
    const cur = map.get(key) ?? { target, action: r.action, count: 0 };
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.target.localeCompare(b.target));
}

export type UserSummary = {
  user: string;
  total: number;
  added: number;
  edited: number;
  deleted: number;
  screens: number;
  sessions: number;
  lastActivity: string | null;
  lastEdit: string | null;
  lastLogin: string | null;
};

/** ملخص لكل مستخدم: أعماله، آخر نشاط، آخر تعديل، آخر دخول. */
export function userSummaries(rows: readonly LogRow[]): UserSummary[] {
  const map = new Map<string, UserSummary>();
  const later = (a: string | null, b: string) => (a == null || b > a ? b : a);
  for (const r of rows) {
    const user = who(r);
    const s = map.get(user) ?? { user, total: 0, added: 0, edited: 0, deleted: 0, screens: 0, sessions: 0, lastActivity: null, lastEdit: null, lastLogin: null };
    s.total += 1;
    s.lastActivity = later(s.lastActivity, r.created_at);
    if (r.action === "إضافة") s.added += 1;
    if (r.action === "تعديل") { s.edited += 1; s.lastEdit = later(s.lastEdit, r.created_at); }
    if (r.action === "حذف") s.deleted += 1;
    if (r.action === "فتح شاشة") s.screens += 1;
    if (r.action === "تسجيل دخول" || r.action === "دخول") { s.sessions += 1; s.lastLogin = later(s.lastLogin, r.created_at); }
    map.set(user, s);
  }
  return [...map.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

export const usersOf = (rows: readonly LogRow[]) => [...new Set(rows.map(who))].sort();
