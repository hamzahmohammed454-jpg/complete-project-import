const ICONS = import.meta.glob("@/assets/home-icons/*.webp", { eager: true, import: "default" }) as Record<string, string>;
export const ICON = (name: string) => Object.entries(ICONS).find(([k]) => k.endsWith(`/${name}.webp`))?.[1] ?? "";

export type Tile = { to: string; label: string; img: string; search?: Record<string, string> };
export type Group = { id: string; title: string; img: string; bg: string; tiles: Tile[]; parent?: string };
export const GROUPS: Group[] = [
  {
    id: "transfers",
    title: "الحوالات",
    bg: "bg-section-ops",
    img: "send",
    tiles: [
      { to: "/section/transfers-setup", label: "تهيئة الحوالات", img: "transfer-setup" },
      { to: "/section/transfers-ops", label: "العمليات", img: "send" },
      { to: "/section/transfers-networks", label: "حوالات الشبكات", img: "customers" },
      { to: "/section/transfers-reports", label: "تقارير", img: "acc-reports" },
      { to: "/section/transfers-totals", label: "الإجماليات", img: "stats" },
    ],
  },
  {
    id: "exchange",
    title: "البيع والشراء",
    bg: "bg-section-ops",
    img: "exchange",
    tiles: [
      { to: "/section/exchange-ops", label: "العمليات", img: "exchange" },
      { to: "/section/exchange-totals", label: "الإجماليات", img: "stats" },
      { to: "/section/exchange-reports", label: "تقارير", img: "cur-reports" },
    ],
  },
  {
    id: "checks",
    title: "الشيكات",
    bg: "bg-section-accounts",
    img: "receipt",
    tiles: [
      { to: "/section/checks-setup", label: "تهيئة الشيكات", img: "setup" },
      { to: "/section/checks-ops", label: "العمليات", img: "receipt" },
      { to: "/section/checks-reports", label: "تقارير", img: "acc-reports" },
    ],
  },
  {
    id: "ledger",
    title: "الحسابات",
    bg: "bg-section-accounts",
    img: "acc-reports",
    tiles: [
      { to: "/section/ledger-setup", label: "تهيئة الحسابات", img: "setup" },
      { to: "/section/ledger-ops", label: "العمليات", img: "receipt" },
      { to: "/section/ledger-reports", label: "تقارير", img: "acc-reports" },
      { to: "/section/ledger-financials", label: "القوائم المالية", img: "stats" },
    ],
  },
  {
    id: "security",
    title: "الأمان",
    bg: "bg-section-tools",
    img: "staff",
    tiles: [
      { to: "/section/security-setup", label: "التهيئة", img: "setup" },
      { to: "/section/security-ops", label: "العمليات", img: "closing" },
      { to: "/section/security-reports", label: "تقارير", img: "acc-reports" },
      { to: "/password", label: "تغيير كلمة المرور", img: "staff" },
    ],
  },
  {
    id: "admin",
    title: "الأدوات الإدارية",
    bg: "bg-section-tools",
    img: "setup",
    tiles: [
      { to: "/section/admin-setup", label: "التهيئة", img: "setup" },
      { to: "/section/admin-ops", label: "العمليات", img: "backup" },
      { to: "/news", label: "الرسائل الإدارية", img: "news" },
      { to: "/license", label: "التحكم بتراخيص أجهزة الحاسب", img: "computer" },
      { to: "/whatsapp", label: "طرق تفعيل إرسال الرسائل", img: "whatsapp" },
      { to: "/section/admin-reports", label: "تقارير", img: "acc-reports" },
      { to: "/section/admin-monitor", label: "رقابة المستخدمين", img: "stats" },
    ],
  },
  {
    id: "ops",
    title: "العمليات اليومية",
    bg: "bg-section-ops",
    img: "exchange",
    tiles: [
      { to: "/exchange", search: { kind: "buy" }, label: "شراء عملات", img: "receive" },
      { to: "/exchange", search: { kind: "sell" }, label: "بيع عملات", img: "send" },
      { to: "/vouchers", search: { kind: "payment" }, label: "سند صرف", img: "pay" },
      { to: "/vouchers", search: { kind: "receipt" }, label: "سند قبض", img: "receipt" },
      { to: "/journal", label: "قيد بسيط", img: "simple" },
      { to: "/entries", label: "قيد مزدوج", img: "double" },
      { to: "/boxes", label: "الصناديق", img: "boxes" },
    ],
  },
  {
    id: "reports",
    title: "التقارير",
    bg: "bg-section-reports",
    img: "acc-reports",
    tiles: [
      { to: "/statement", label: "تقارير الحسابات", img: "acc-reports" },
      { to: "/daily-report", label: "تقارير العملات", img: "cur-reports" },
      { to: "/box-report", label: "ميزان الصناديق", img: "stats" },
      { to: "/statistics", label: "احصائيات", img: "stats" },
    ],
  },
  {
    id: "accounts",
    title: "الحسابات والإعداد",
    bg: "bg-section-accounts",
    img: "customers",
    tiles: [
      { to: "/customers", label: "الحسابات والعملاء", img: "customers" },
      { to: "/currencies", label: "العملات", img: "currencies" },
      { to: "/staff", label: "اعداد المستخدمين", img: "staff" },
      { to: "/setup", label: "الضبط", img: "setup" },
      { to: "/transfer-setup", label: "التهيئة", img: "transfer-setup" },
      { to: "/closing", label: "الإقفالات المحاسبية", img: "closing" },
      { to: "/getting-started", label: "الإعداد الأولي", img: "setup" },
      { to: "/settings", label: "الإعدادات", img: "setup" },
    ],
  },
  {
    id: "tools",
    title: "أدوات وتواصل",
    bg: "bg-section-tools",
    img: "assistant",
    tiles: [
      { to: "/whatsapp", label: "واتساب", img: "whatsapp" },
      { to: "/wa-bot", label: "بوت واتساب", img: "wa-bot" },
      { to: "/wa-chats", label: "محادثات واتساب", img: "wa-chats" },
      { to: "/auto-reply", label: "الرد الآلي", img: "autoreply" },
      { to: "/assistant", label: "المساعد الآلي", img: "assistant" },
      { to: "/news", label: "الأخبار", img: "news" },
      { to: "/backup", label: "النسخ الاحتياطي", img: "backup" },
      { to: "/voucher-design", label: "تصميم الإشعارات", img: "receipt" },
      { to: "/computer", label: "ربط بالكمبيوتر", img: "computer" },
      { to: "/app-status", label: "حالة النشر", img: "computer" },
      { to: "/contact", label: "تواصل معنا", img: "contact" },
    ],
  },
];


// أقسام فرعية داخل «الحوالات» — لا تظهر في الشاشة الرئيسية، تُفتح من صفحة الحوالات
const ts = (kind: string, label: string): Tile => ({ to: "/transfer-setup", search: { kind }, label, img: "transfer-setup" });
const tr = (r: string, label: string, img = "acc-reports"): Tile => ({ to: "/transfer-reports", search: { r }, label, img });
export const SUB_GROUPS: Group[] = [
  {
    id: "transfers-setup", parent: "transfers", title: "تهيئة الحوالات", bg: "bg-section-ops", img: "transfer-setup",
    tiles: [
      ts("countries", "دليل الدول"), ts("governorates", "دليل المحافظات"), ts("areas", "دليل المناطق"),
      ts("entities", "دليل الجهات"), ts("purposes", "دليل أغراض التحويل"), ts("blacklist", "القائمة السوداء"),
      ts("forbidden", "النصوص الممنوعة في الحوالات"), ts("receivers", "بطاقات المستلمين"),
      { to: "/commissions", label: "نظام العمولات", img: "exchange" },
    ],
  },
  {
    id: "transfers-ops", parent: "transfers", title: "العمليات", bg: "bg-section-ops", img: "send",
    tiles: [
      { to: "/transfers", search: { dir: "incoming" }, label: "توريد الحوالات", img: "receive" },
      { to: "/transfers", search: { dir: "outgoing" }, label: "قبض الحوالات", img: "send" },
      { to: "/transfers", search: { view: "pay" }, label: "صرف الحوالات", img: "pay" },
      { to: "/transfers", search: { view: "export" }, label: "تصدير الحوالات", img: "send" },
      { to: "/transfer-requests", label: "طلبات تعديل وإلغاء وإيقاف", img: "transfer-setup" },
      tr("out-list", "الكشوفات الصادرة"),
      tr("in-list", "الكشوفات الواردة"),
    ],
  },
  {
    id: "transfers-networks", parent: "transfers", title: "حوالات الشبكات", bg: "bg-section-ops", img: "customers",
    tiles: [
      { to: "/agents", label: "الوكلاء والشبكات", img: "customers" },
      { to: "/statement", label: "كشف حساب وكيل", img: "acc-reports" },
    ],
  },
  {
    id: "transfers-reports", parent: "transfers", title: "تقارير الحوالات", bg: "bg-section-ops", img: "acc-reports",
    tiles: [
      tr("paid", "تقرير تأكيد صرف الحوالات"),
      { to: "/section/transfers-totals", label: "تقرير الإجماليات", img: "stats" },
      tr("all", "تقارير الحوالات"),
      tr("age", "تقارير عمر الحوالات الصادرة والمصروفة"),
      { to: "/profits", label: "تقرير أرباح فوارق الحوالات", img: "stats" },
      tr("gaps", "تقرير أرقام الحوالات الناقصة"),
      tr("search", "البحث عن الحوالات"),
      tr("date-diff", "تقرير اختلاف تاريخ الحوالات"),
      tr("dupes", "تقرير الحوالات المكررة"),
      tr("blacklist", "تقرير الحوالات في القائمة السوداء"),
      tr("canceled", "تقرير الحوالات الملغية"),
      ts("receivers", "تقرير بيانات بطائق الحوالات"),
      tr("customers", "تقرير حوالات العملاء"),
    ],
  },
  {
    id: "transfers-totals", parent: "transfers", title: "الإجماليات", bg: "bg-section-ops", img: "stats",
    tiles: [
      tr("totals-in", "إجماليات الوارد", "stats"),
      tr("totals-in-daily", "تقارير إجماليات الوارد", "stats"),
      tr("totals-out", "إجماليات الصادر", "stats"),
      tr("totals-out-daily", "تقارير إجماليات الصادر", "stats"),
    ],
  },
];
// أقسام فرعية داخل «البيع والشراء»
const er = (r: string, label: string, img = "cur-reports"): Tile => ({ to: "/exchange-reports", search: { r }, label, img });
SUB_GROUPS.push(
  {
    id: "exchange-ops", parent: "exchange", title: "عمليات البيع والشراء", bg: "bg-section-ops", img: "exchange",
    tiles: [
      { to: "/exchange", search: { kind: "buy" }, label: "شراء العملات النقدية", img: "receive" },
      { to: "/exchange", search: { kind: "sell" }, label: "بيع العملات النقدية", img: "send" },
    ],
  },
  {
    id: "exchange-totals", parent: "exchange", title: "إجماليات البيع والشراء", bg: "bg-section-ops", img: "stats",
    tiles: [er("buy-totals", "إجماليات الشراء", "stats"), er("sell-totals", "إجماليات البيع", "stats")],
  },
  {
    id: "exchange-reports", parent: "exchange", title: "تقارير البيع والشراء", bg: "bg-section-ops", img: "cur-reports",
    tiles: [er("limits", "تقرير العمليات التي تجاوزت الحد الأدنى أو الأعلى"), er("all", "تقرير البيع والشراء")],
  },
);
// أقسام فرعية داخل «الشيكات»
SUB_GROUPS.push(
  {
    id: "checks-setup", parent: "checks", title: "تهيئة الشيكات", bg: "bg-section-accounts", img: "setup",
    tiles: [
      { to: "/banks", label: "دليل البنوك", img: "acc-reports" },
      { to: "/check-books", label: "دفاتر الشيكات", img: "receipt" },
    ],
  },
  {
    id: "checks-ops", parent: "checks", title: "عمليات الشيكات", bg: "bg-section-accounts", img: "receipt",
    tiles: [
      { to: "/checks", label: "تسجيل وتحصيل الشيكات", img: "receipt" },
    ],
  },
  {
    id: "checks-reports", parent: "checks", title: "تقارير الشيكات", bg: "bg-section-accounts", img: "acc-reports",
    tiles: [
      { to: "/checks", label: "كشف الشيكات (تحت التحصيل / مستحقة / محصل / مرتجع)", img: "acc-reports" },
    ],
  },
);
// أقسام فرعية داخل «الحسابات»
SUB_GROUPS.push(
  {
    id: "ledger-setup", parent: "ledger", title: "تهيئة الحسابات", bg: "bg-section-accounts", img: "setup",
    tiles: [
      { to: "/commissions", label: "دليل نظام العمولات - الحسابات", img: "exchange" },
      { to: "/accounts", label: "دليل الحسابات", img: "customers" },
      { to: "/currencies", label: "دليل العملات", img: "currencies" },
      { to: "/currencies", label: "دليل أسعار العملات", img: "cur-reports" },
      { to: "/boxes", label: "دليل الصناديق", img: "boxes" },
      { to: "/bank-accounts", label: "الحسابات البنكية", img: "acc-reports" },
      { to: "/cost-centers", label: "مراكز التكلفة", img: "stats" },
      { to: "/financial-years", label: "السنوات المالية", img: "closing" },
      { to: "/setup", search: { section: "branches" }, label: "بيانات المركز الرئيسي والفروع", img: "setup" },
      { to: "/setup", search: { section: "groups" }, label: "دليل المجموعات", img: "setup" },
      { to: "/permissions", label: "صلاحيات المجموعات", img: "staff" },
      { to: "/staff", label: "دليل الموظفين", img: "staff" },
    ],
  },
  {
    id: "ledger-ops", parent: "ledger", title: "عمليات الحسابات", bg: "bg-section-accounts", img: "receipt",
    tiles: [
      { to: "/vouchers", search: { kind: "payment" }, label: "سند صرف عملاء", img: "pay" },
      { to: "/vouchers", search: { kind: "receipt" }, label: "سند قبض عملاء", img: "receipt" },
      { to: "/vouchers", search: { kind: "deposit" }, label: "سند إيداع نقدي", img: "receipt" },
      { to: "/vouchers", search: { kind: "payment", multi: "true" }, label: "سند صرف متعدد العملات", img: "pay" },
      { to: "/vouchers", search: { kind: "receipt", multi: "true" }, label: "سند قبض متعدد العملات", img: "receipt" },
      { to: "/withdrawal-requests", label: "طلبات السحب", img: "pay" },
      { to: "/journal", label: "سند قيد بسيط", img: "simple" },
      { to: "/entries", label: "القيود المزدوجة / الأرصدة الافتتاحية", img: "double" },
      { to: "/loop-entries", label: "القيود الدائرية", img: "double" },
      { to: "/closing", label: "جرد الصندوق وسند إقفال صندوق", img: "closing" },
      { to: "/funds-inventory", label: "جرد الصناديق", img: "boxes" },
    ],
  },
  {
    id: "ledger-reports", parent: "ledger", title: "تقارير الحسابات", bg: "bg-section-accounts", img: "acc-reports",
    tiles: [
      { to: "/statement", label: "كشف حساب وأعمار الديون", img: "acc-reports" },
      { to: "/box-report", label: "نقدية الصندوق", img: "boxes" },
      { to: "/entries", label: "اليومية", img: "double" },
      { to: "/currencies", label: "تعديلات أسعار العملات", img: "cur-reports" },
      { to: "/daily-report", label: "المركز المالي للعملات الأجنبية", img: "cur-reports" },
      { to: "/period-closing", label: "الإقفالات", img: "closing" },
      { to: "/activity", label: "عمليات الحذف والتعديل في النظام", img: "stats" },
    ],
  },
  {
    id: "ledger-financials", parent: "ledger", title: "القوائم المالية", bg: "bg-section-accounts", img: "stats",
    tiles: [
      { to: "/reports", label: "ميزان المراجعة", img: "stats" },
      { to: "/financials", label: "قائمة المركز المالي", img: "stats" },
      { to: "/financials", label: "الأرباح والخسائر", img: "stats" },
    ],
  },
);
// أقسام فرعية داخل «الأمان» و«الأدوات الإدارية»
const um = (r: string, label: string): Tile => ({ to: "/activity", search: { r }, label, img: "stats" });
SUB_GROUPS.push(
  {
    id: "security-setup", parent: "security", title: "تهيئة الأمان", bg: "bg-section-tools", img: "setup",
    tiles: [
      { to: "/setup", search: { section: "usergroups" }, label: "دليل مجموعات المستخدمين", img: "staff" },
      { to: "/staff", label: "دليل المستخدمين", img: "staff" },
      { to: "/permissions", label: "الصلاحيات", img: "setup" },
    ],
  },
  {
    id: "security-ops", parent: "security", title: "عمليات الأمان", bg: "bg-section-tools", img: "closing",
    tiles: [{ to: "/period-closing", label: "قفل العمليات", img: "closing" }],
  },
  {
    id: "security-reports", parent: "security", title: "تقارير الأمان", bg: "bg-section-tools", img: "acc-reports",
    tiles: [{ to: "/license", label: "تقرير أكواد التفعيل للمستخدمين", img: "acc-reports" }],
  },
  {
    id: "admin-setup", parent: "admin", title: "التهيئة", bg: "bg-section-tools", img: "setup",
    tiles: [
      { to: "/setup", search: { section: "branches" }, label: "بيانات المركز الرئيسي والفروع", img: "setup" },
      { to: "/settings", label: "الإعدادات", img: "setup" },
      { to: "/system-settings", label: "إعدادات النظام (الفرع والمستخدم)", img: "setup" },
      { to: "/voucher-design", label: "تصميم الإشعارات", img: "receipt" },
      { to: "/getting-started", label: "الإعداد الأولي", img: "setup" },
    ],
  },
  {
    id: "admin-ops", parent: "admin", title: "العمليات", bg: "bg-section-tools", img: "backup",
    tiles: [
      { to: "/backup", label: "النسخ الاحتياطي", img: "backup" },
      { to: "/computer", label: "ربط بالكمبيوتر", img: "computer" },
      { to: "/sync", label: "حالة الاتصال والمزامنة", img: "computer" },
    ],
  },
  {
    id: "admin-reports", parent: "admin", title: "تقارير", bg: "bg-section-tools", img: "acc-reports",
    tiles: [
      { to: "/license", label: "إعادة تفعيل أكواد التفعيل", img: "acc-reports" },
      { to: "/activity", label: "سجلات الأحداث", img: "stats" },
    ],
  },
  {
    id: "admin-monitor", parent: "admin", title: "رقابة المستخدمين", bg: "bg-section-tools", img: "stats",
    tiles: [
      um("saved", "المحفوظات"),
      um("by-doc", "المحفوظات بحسب المستند ونوع العملية"),
      um("last-edit", "تقرير مستخدم وتاريخ آخر عمليات التعديل"),
      um("monitor", "تقرير مراقبة المستخدمين"),
      um("works", "تقرير أعمال المستخدمين"),
      um("sessions", "جلسات المستخدمين"),
      um("employee", "تقرير كافة عمليات الموظف"),
    ],
  },
);
export const findGroup = (id: string) => GROUPS.find((g) => g.id === id) ?? SUB_GROUPS.find((g) => g.id === id);
