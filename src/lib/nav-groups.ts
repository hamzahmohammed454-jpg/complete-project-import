import {
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  BookCopy,
  BookOpen,
  BookOpenText,
  Building2,
  Calculator,
  Gauge,
  CalendarRange,
  ClipboardCheck,
  Coins,
  DatabaseBackup,
  History,
  MessageSquare,
  Megaphone,
  Bell,
  FileSpreadsheet,
  Home,
  Landmark,
  Lock,
  LockKeyhole,
  Network,
  Percent,
  PieChart,
  Receipt,
  Repeat,
  Repeat2,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

/**
 * قوائم النظام: كل تبويب أسفل الشاشة قائمة، وما تحتها شاشاتها.
 * الإدارة والإعدادات قائمة مستقلة في الترويسة، وليست تبويبًا ماليًا.
 */
export const PRIMARY_TABS = [
  { to: "/app", label: "الرئيسية", icon: Home },
  { to: "/transfers", label: "الحوالات", icon: ArrowLeftRight },
  { to: "/exchange", label: "الصرافة", icon: Repeat },
  { to: "/boxes", label: "الصناديق", icon: Wallet },
  { to: "/accounts", label: "الحسابات", icon: Network },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
] as const;

export const NAV_GROUPS = [
  {
    tab: "/transfers",
    title: "الحوالات",
    items: [
      { to: "/transfer-setup", label: "تهيئة الحوالات", icon: Settings2, tone: "gold", section: "تهيئة الحوالات" },
      { to: "/transfers", label: "قبض وصرف وتصدير وتوريد الحوالات", icon: ArrowLeftRight, tone: "mint", section: "العمليات" },
      { to: "/transfer-requests", label: "طلبات تعديل وإلغاء وإيقاف الحوالات", icon: ArrowLeftRight, tone: "gold", section: "العمليات" },
    ],
  },
  {
    tab: "/exchange",
    title: "الصرافة",
    items: [
      { to: "/exchange", label: "شراء وبيع العملات", icon: Repeat, tone: "lime", section: "العمليات" },

    ],
  },
  {
    tab: "/boxes",
    title: "الصناديق",
    items: [
      { to: "/boxes", label: "الصناديق", icon: Wallet, tone: "teal", section: "الصناديق" },
      { to: "/checks", label: "تسجيل وتحصيل الشيكات", icon: Landmark, tone: "sky", section: "عمليات الشيكات" },
      { to: "/banks", label: "دليل البنوك", icon: Landmark, tone: "violet", section: "تهيئة الشيكات" },
      { to: "/check-books", label: "دفاتر الشيكات", icon: BookCopy, tone: "mint", section: "تهيئة الشيكات" },
      { to: "/funds-inventory", label: "جرد الصناديق", icon: ClipboardCheck, tone: "teal", section: "الصناديق" },
      { to: "/closing", label: "الإقفال اليومي", icon: Lock, tone: "rose", section: "الصناديق" },
    ],
  },
  {
    tab: "/accounts",
    title: "الحسابات",
    items: [
      { to: "/accounts", label: "دليل الحسابات", icon: Network, tone: "violet", section: "تهيئة الحسابات" },
      { to: "/customers", label: "دليل العملاء", icon: Users, tone: "mint", section: "تهيئة الحسابات" },
      { to: "/agents", label: "دليل الوكلاء", icon: UserCheck, tone: "lime", section: "تهيئة الحسابات" },
      { to: "/currencies", label: "العملات وأسعار الصرف", icon: Coins, tone: "gold", section: "تهيئة الحسابات" },
      { to: "/commissions", label: "نظام العمولات", icon: Percent, tone: "rose", section: "تهيئة الحسابات" },
      { to: "/bank-accounts", label: "الحسابات البنكية", icon: Building2, tone: "sky", section: "تهيئة الحسابات" },
      { to: "/cost-centers", label: "مراكز التكلفة", icon: Target, tone: "lime", section: "تهيئة الحسابات" },
      { to: "/vouchers", label: "سندات قبض وصرف العملاء", icon: Receipt, tone: "violet", section: "العمليات" },
      { to: "/withdrawal-requests", label: "طلبات السحب", icon: Receipt, tone: "gold", section: "العمليات" },
      { to: "/journal", label: "سند قيد بسيط", icon: BookOpenText, tone: "violet", section: "العمليات" },
      { to: "/entries", label: "القيود المزدوجة", icon: BookOpen, tone: "teal", section: "العمليات" },
      { to: "/loop-entries", label: "القيود الدائرية", icon: Repeat2, tone: "mint", section: "العمليات" },
      { to: "/financial-years", label: "السنوات المالية", icon: CalendarRange, tone: "gold", section: "العمليات" },
      { to: "/period-closing", label: "إقفال الحسابات", icon: LockKeyhole, tone: "rose", section: "العمليات" },
      { to: "/statement", label: "كشف حساب", icon: BookOpen, tone: "blue", section: "تقارير" },
      { to: "/statistics", label: "إحصائيات الحسابات", icon: PieChart, tone: "violet", section: "تقارير" },
      { to: "/reports", label: "ميزان المراجعة", icon: BarChart3, tone: "sky", section: "القوائم المالية" },
      { to: "/financials", label: "المركز المالي والأرباح والخسائر", icon: TrendingUp, tone: "teal", section: "القوائم المالية" },
    ],
  },
  {
    tab: "/reports",
    title: "التقارير",
    items: [
      { to: "/cash-position", label: "وضع الصرافة الآن", icon: Gauge, tone: "teal", section: "الإجماليات" },
      { to: "/exceptions", label: "الاستثناءات ومطابقة الوكلاء", icon: Bell, tone: "rose", section: "الإجماليات" },
      { to: "/totals", label: "الإجماليات", icon: Calculator, tone: "blue", section: "الإجماليات" },
      { to: "/profits", label: "الأرباح", icon: BadgeDollarSign, tone: "gold", section: "تقارير" },
      { to: "/daily-report", label: "التقرير اليومي ومركز العملات", icon: FileSpreadsheet, tone: "teal", section: "تقارير" },
      { to: "/alerts", label: "تنبيهات المدير", icon: Bell, tone: "rose", section: "تقارير" },
    ],
  },
  {
    tab: "/administration",
    title: "الأدوات الإدارية",
    items: [
      { to: "/administration", label: "الأدوات الإدارية", icon: Settings2, tone: "blue", section: "المستخدمون والصلاحيات" },
      { to: "/staff", label: "دليل المستخدمين والصلاحيات", icon: ShieldCheck, tone: "violet", section: "المستخدمون والصلاحيات" },
      { to: "/setup", label: "مجموعات المستخدمين والفروع", icon: Settings2, tone: "sky", section: "المستخدمون والصلاحيات" },
      { to: "/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup, tone: "teal", section: "أدوات النظام" },
      { to: "/activity", label: "سجل العمليات", icon: History, tone: "gold", section: "أدوات النظام" },
      { to: "/auto-reply", label: "الرد الآلي", icon: MessageSquare, tone: "teal", section: "أدوات النظام" },
      { to: "/wa-bot", label: "بوت واتساب", icon: MessageSquare, tone: "mint", section: "أدوات النظام" },
      { to: "/news", label: "أخبار الموظفين", icon: Megaphone, tone: "gold", section: "أدوات النظام" },
      { to: "/license", label: "التجربة والتفعيل", icon: LockKeyhole, tone: "gold", section: "أدوات النظام" },
    ],
  },
] as const;

export type NavGroup = (typeof NAV_GROUPS)[number];
export type NavTab = NavGroup["tab"];
export type NavItem = NavGroup["items"][number];

/** شاشات مرجع إبداع التي لم تُبنَ بعد: تظهر في القائمة معطلة بعلامة «قريبًا» ولا تفتح شاشة وهمية. */
export const PLANNED_ITEMS: Partial<Record<NavTab, readonly { section: string; labels: readonly string[] }[]>> = {
  "/transfers": [
    { section: "تهيئة الحوالات", labels: ["دليل جهة الفرع", "صلاحيات الجهات للفرع (قبض/صرف)", "دليل أسعار التحويل", "طرق ترحيل الحوالات"] },
    { section: "حوالات الشبكات", labels: ["حوالات الشبكات (الربط الخارجي مؤجل)"] },
    { section: "تقارير", labels: ["تقرير تأكيد صرف الحوالات", "تقرير الحوالات", "تقرير عمر الحوالات", "تقرير أرقام الحوالات الناقصة", "تقرير الحوالات المكررة", "تقرير الحوالات الملغاة والمعدلة", "تقرير حوالات العملاء", "البحث عن الحوالات"] },
    { section: "الإجماليات", labels: ["إجماليات الوارد", "إجماليات الصادر"] },
  ],
  "/exchange": [
    { section: "العمليات", labels: ["شراء العملات النقدية", "بيع العملات النقدية"] },
    { section: "الإجماليات", labels: ["إجماليات الشراء", "إجماليات البيع"] },
    { section: "تقارير", labels: ["تقرير تجاوز الحد الأدنى أو الأعلى", "تقارير البيع والشراء", "تقارير طلبات البيع والشراء"] },
  ],
  "/boxes": [],
  "/administration": [
    { section: "أدوات النظام", labels: ["سجل دخول المستخدمين", "الإعدادات العامة"] },
  ],
};

export function navigationSections(tab: NavTab) {
  const items = groupItems(tab);
  const planned = PLANNED_ITEMS[tab] ?? [];
  const names = [...new Set([...items.map((item) => "section" in item ? item.section : "الشاشات"), ...planned.map((p) => p.section)])];
  return names.map((title) => ({
    title,
    items: items.filter((item) => ("section" in item ? item.section : "الشاشات") === title),
    planned: planned.filter((p) => p.section === title).flatMap((p) => p.labels),
  }));
}

/** أي شاشة في النظام تُنسب لتبويب حتى يبقى التبويب مضيئًا دائمًا. */
export const TAB_OF: Record<string, string> = {
  "/app": "/app",
  "/password": "/app",
  "/sync": "/app",
  "/voucher": "/boxes",
  ...Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.to, g.tab]))),
};

/** شاشات قائمة واحدة — تُعرض في شريط أعلى الشاشة وفي الرئيسية. */
export function groupItems(tab: NavTab): readonly NavItem[] {
  return NAV_GROUPS.find((g) => g.tab === tab)?.items ?? [];
}

/** Resolve each group to an existing permitted screen without altering screen permissions. */
export function accessibleTabs(canSee: (path: string) => boolean) {
  type VisibleTab = {
    to: "/app" | NavItem["to"];
    label: (typeof PRIMARY_TABS)[number]["label"];
    icon: (typeof PRIMARY_TABS)[number]["icon"];
  };
  const tabs: VisibleTab[] = [];
  for (const tab of PRIMARY_TABS) {
    if (tab.to === "/app") {
      tabs.push(tab);
      continue;
    }
    const destination = groupItems(tab.to).find((item) => canSee(item.to));
    if (destination) tabs.push({ ...tab, to: destination.to });
  }
  return tabs;
}
