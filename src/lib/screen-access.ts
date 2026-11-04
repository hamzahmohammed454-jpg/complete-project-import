/**
 * أي شاشات يراها الموظف: تُقرأ من مجموعاته في public.user_groups.
 * القاعدة: مدير النظام يرى كل شيء، ومن ليس في مجموعة مقيِّدة يرى كل شيء،
 * والمجموعة المقيِّدة تُظهر ما حُدِّد لها فقط.
 */

/** كل شاشة في النظام: مفتاحها هو مسارها، وعنوانها ما يراه الموظف. */
export const SCREENS = [
  { to: "/transfers", label: "الحوالات" },
  { to: "/transfer-requests", label: "طلبات الحوالات" },
  { to: "/transfer-setup", label: "تهيئة الحوالات" },
  { to: "/exchange", label: "بيع وشراء" },
  { to: "/boxes", label: "الصناديق" },
  { to: "/closing", label: "الإقفال اليومي" },
  { to: "/vouchers", label: "سندات العملاء" },
  { to: "/withdrawal-requests", label: "طلبات السحب" },
  { to: "/journal", label: "قيد بسيط" },
  { to: "/checks", label: "الشيكات" },
  { to: "/banks", label: "البنوك" },
  { to: "/check-books", label: "دفاتر الشيكات" },
  { to: "/funds-inventory", label: "جرد الصناديق" },
  { to: "/bank-accounts", label: "الحسابات البنكية" },
  { to: "/cost-centers", label: "مراكز التكلفة" },
  { to: "/loop-entries", label: "القيود الدائرية" },
  { to: "/financial-years", label: "السنوات المالية" },
  { to: "/statement", label: "كشف الحساب" },
  { to: "/entries", label: "القيود" },
  { to: "/customers", label: "العملاء" },
  { to: "/agents", label: "الوكلاء" },
  { to: "/accounts", label: "شجرة الحسابات" },
  { to: "/period-closing", label: "الإقفال المحاسبي" },
  { to: "/currencies", label: "العملات" },
  { to: "/commissions", label: "العمولات" },
  { to: "/reports", label: "التقارير" },
  { to: "/financials", label: "القوائم المالية" },
  { to: "/totals", label: "الإجماليات" },
  { to: "/cash-position", label: "وضع الصرافة الآن" },
  { to: "/exceptions", label: "الاستثناءات ومطابقة الوكلاء" },
  { to: "/transfer-reports", label: "تقارير الحوالات" },
  { to: "/exchange-reports", label: "تقارير البيع والشراء" },
  { to: "/statistics", label: "الإحصائيات" },
  { to: "/profits", label: "الأرباح" },
  { to: "/daily-report", label: "التقرير اليومي ومركز العملات" },
  { to: "/alerts", label: "تنبيهات المدير" },
  { to: "/news", label: "أخبار الموظفين" },
  { to: "/license", label: "التجربة والتفعيل" },
  { to: "/backup", label: "النسخ الاحتياطي" },
  { to: "/auto-reply", label: "الرد الآلي" },
  { to: "/wa-bot", label: "بوت واتساب" },
  { to: "/wa-chats", label: "محادثات واتساب" },
  { to: "/staff", label: "الموظفون" },
  { to: "/activity", label: "سجل العمليات" },
  { to: "/setup", label: "التهيئة" },
  { to: "/system-settings", label: "إعدادات النظام" },
] as const;

export type ScreenPath = (typeof SCREENS)[number]["to"];

/** هل يرى الموظف هذه الشاشة؟ */
export function screenAllowed(
  path: string,
  allowed: readonly string[],
  roles: readonly string[],
): boolean {
  if (path === "/license") return roles.includes("admin");
  if (roles.includes("admin")) return true;
  if (allowed.length === 0) return true;
  return allowed.includes(path);
}

/**
 * التبويبات التي تُعرض أسفل الشاشة. إذا أفضت القيود إلى تبويبات فارغة
 * نُبقي الكل حتى لا يبقى الموظف بلا تنقّل.
 */
export function visibleTabs<T extends { to: string }>(
  tabs: readonly T[],
  allowed: readonly string[],
  roles: readonly string[],
): readonly T[] {
  const shown = tabs.filter((t) => screenAllowed(t.to, allowed, roles));
  return shown.length > 0 ? shown : tabs;
}
