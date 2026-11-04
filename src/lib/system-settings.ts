/**
 * سجل إعدادات النظام (نقلاً عن نافذة الإعدادات في النظام السابق).
 * كل بند: مفتاح ثابت + نوع + قيمة افتراضية. `live` = البند مربوط فعلاً بسلوك النظام.
 * القيمة النهائية: إعداد المستخدم ← إعداد فرعه ← إعداد كل الفروع ← الافتراضي.
 */
export type SettingType = "bool" | "number" | "text" | "select" | "color";
export type SettingValue = boolean | number | string;
export type SettingItem = {
  key: string;
  label: string;
  group: string;
  type: SettingType;
  def: SettingValue;
  options?: readonly string[];
  live?: boolean;
};
export type SettingScope = "branch" | "user";
export type SettingSection = { id: string; label: string; branch: readonly SettingItem[]; user: readonly SettingItem[] };

const b = (key: string, label: string, group: string, def: boolean, live = false): SettingItem => ({ key, label, group, type: "bool", def, live });
const n = (key: string, label: string, group: string, def: number, live = false): SettingItem => ({ key, label, group, type: "number", def, live });
const t = (key: string, label: string, group: string, def: string, live = false): SettingItem => ({ key, label, group, type: "text", def, live });
const s = (key: string, label: string, group: string, options: readonly string[], def: string, live = false): SettingItem => ({ key, label, group, type: "select", def, options, live });
const c = (key: string, label: string, group: string, def: string): SettingItem => ({ key, label, group, type: "color", def });

export const SETTINGS_TREE: readonly SettingSection[] = [
  {
    id: "general",
    label: "عام",
    branch: [
      b("gen.email_reports", "تفعيل ارسال التقارير عبر البريد الالكتروني", "ارسال الملفات", false),
      b("gen.email_docs", "تفعيل ارسال المستندات عبر البريد الالكتروني", "ارسال الملفات", false),
      t("gen.company_email", "البريد الإلكتروني للشركة", "إعدادات البريد الإلكتروني", ""),
      s("gen.letterhead", "الكليشة", "الطباعة", ["الكليشة العامة", "كليشة الفرع"], "الكليشة العامة"),
      b("gen.pdf_one_doc", "طباعة الكل PDF في مستند واحد", "الطباعة", true),
      n("gen.margin_bottom", "محاذاة من الأسفل", "الطباعة (الهوامش)", 30),
      n("gen.margin_top", "محاذاة من الأعلى", "الطباعة (الهوامش)", 30),
      n("gen.margin_left", "محاذاة من اليسار", "الطباعة (الهوامش)", 10),
      n("gen.margin_right", "محاذاة من اليمين", "الطباعة (الهوامش)", 10),
      b("gen.show_scrollbar", "إظهار شريط التمرير في الواجهات", "ثيم النظام", false),
      s("gen.theme", "تغيير ثيم النظام", "ثيم النظام", ["Blue", "Gold", "Gray"], "Blue"),
      b("gen.disable_error_log", "تعطيل حفظ سجل الاخطاء في الهوست", "حفظ اللوق", true),
      b("gen.log_bank_transfers", "تفعيل حفظ اللوق لعمليات التحويلات المصرفية", "حفظ اللوق", false),
      b("gen.log_wallets", "تفعيل حفظ اللوق لعمليات المحافظ الالكترونية", "حفظ اللوق", false),
      b("gen.log_topups", "تفعيل حفظ اللوق لعمليات شحن الرصيد", "حفظ اللوق", false),
      b("gen.paging", "Paging Enable", "عام", false),
      n("gen.paging_size", "Paging Size", "عام", 100),
      b("gen.req_address", "إجباري ادخال العنوان في بيانات البطاقة", "عام", true),
      b("gen.req_workplace", "إجباري ادخال جهة العمل في بيانات البطاقة", "عام", true),
      b("gen.ticker_rates", "إظهار أسعار صرف العملات في شريط الأخبار", "عام", true),
      b("gen.warn_date_change", "التحذير عند تغيير تاريخ العرض في نماذج الإدخال", "عام", true),
      b("gen.warn_close_windows", "التنبية عند إغلاق نوافذ النظام", "عام", false, true),
      b("gen.warn_exit", "التنبية عند الخروج من النظام", "عام", true, true),
      n("gen.zk_min_check", "ZKTeco الحد الأدنى لفحص ما اذا كانت البصمة موجودة بالفعل", "عام", 50),
      n("gen.zk_min_match", "ZKTeco الحد الأدنى لمطابقة البصمة", "عام", 70),
      t("gen.default_currency", "العملة الافتراضية", "عام", "ريال يمني"),
      b("gen.no_reprint_password", "إلغاء كلمة مكرر من طباعة السندات", "عام", false),
      b("gen.req_cost_center", "المطالبة بإدخال مركز التكلفة", "عام", false),
      b("gen.auto_refresh_master", "تحديث البيانات الاساسية تلقائيا", "عام", true),
      b("gen.sort_asc", "ترتيب السجلات تصاعديا", "عام", false),
      b("gen.shade_reports", "تظليل التقارير", "عام", true),
      b("gen.paymethod_by_account", "تغير طريقة الدفع تبعا لتغير نوع الحساب", "عام", true),
      b("gen.autocomplete", "تفعيل الاكمال التلقائي", "عام", false),
      b("gen.user_monitor", "تفعيل مراقبة المستخدم", "عام", true),
      t("gen.grid_font", "خط الشبكة", "عام", "Tahoma; 8.25pt"),
      n("gen.acc_banks", "رقم الحساب الرئيسي للبنوك", "عام", 1212),
      n("gen.acc_checks", "رقم الحساب الرئيسي للشيكات", "عام", 1213),
      n("gen.acc_boxes", "رقم الحساب الرئيسي للصناديق", "عام", 1211),
      t("gen.ticker_refresh", "زمن تحديث شريط الأخبار", "عام", "00:00:00"),
      b("gen.multi_currency_msg", "ظهور رسالة بالتعامل بأكثر من عملة", "عام", false),
      n("gen.decimals", "عدد خانات التقريب", "عام", 4),
      b("gen.no_manual_numbers", "عدم السماح بالترقيم اليدوي للسندات", "عام", true),
      b("gen.show_on_refresh", "عرض السجلات عند الضغط على زر تحديث في شاشات الإدخال", "عام", true),
      b("gen.shift_shortcut", "فتح إختصار لنفس الشاشة عند الضغط على مفتاح Shift", "عام", true),
      s("gen.search_mode", "كلمة البحث الإفتراضية", "عام", ["يحتوي", "يبدأ بـ", "يساوي"], "يحتوي"),
      c("gen.color_urgent", "لون الرسائل العاجلة", "عام", "#ff0000"),
      c("gen.color_normal", "لون الرسائل العادية", "عام", "#00ff00"),
      c("gen.color_important", "لون الرسائل المهمة", "عام", "#f0f0f0"),
      c("gen.color_window", "لون خلفية النوافذ", "عام", "#f0f0f0"),
      c("gen.color_ticker", "لون خلفية شريط الأخبار", "عام", "#0078d7"),
      c("gen.color_grid", "لون شبكة عرض البيانات", "عام", "#e3e3e3"),
      t("gen.amount_left", "محدد المبالغ يسار", "عام", "#"),
      t("gen.amount_right", "محدد المبالغ يمين", "عام", "#"),
      t("gen.archive_path", "مسار حفظ الإرشيف", "عام", ""),
      t("gen.card_images_path", "مسار حفظ صور البطاقات", "عام", ""),
      t("gen.card_images_server", "مسار حفظ صور البطاقات في السيرفر", "عام", ""),
      t("gen.id_sync_path", "مسار حفظ صور البطائق الشخصية في السرفر بواسطة برنامج مزامنة الصور", "عام", ""),
      t("gen.ext_attach_path", "مسار حفظ صور المرفقات لإرسال الحوالات الخارجية في السيرفر", "عام", ""),
      b("gen.lock_after_approve", "منع تعديل وحذف السجلات الا بعد إلغاء الإعتماد", "عام", true),
      s("gen.fingerprint_device", "نوع جهاز البصمة", "عام", ["Virdi", "ZKTeco", "بدون"], "Virdi"),
      n("gen.idle_minutes", "وقت إنهاء الجلسة الخاملة بالدقائق", "عام", 30, true),
    ],
    user: [
      b("usr.choose_printer", "اختيار الطابعة قبل عملية الطباعة", "الطباعة", true),
      t("usr.printer_default", "الطابعة الافتراضية", "الطباعة", ""),
      t("usr.printer_reports", "طابعة التقارير", "الطباعة", ""),
      t("usr.printer_docs", "طابعة المستندات", "الطباعة", ""),
      b("usr.auto_print_docs", "طباعة المستندات تلقائيا", "الطباعة", false),
      t("usr.pdf_path", "مسار حفظ الطباعة إلى PDF", "الطباعة", "D:\\المستندات"),
      b("usr.preview_reports", "معاينة التقارير قبل الطباعة", "الطباعة", true),
      b("usr.preview_docs", "معاينة المستندات قبل الطباعة", "الطباعة", true),
      b("usr.force_box", "إجباري ربط المستخدم بصندوقه", "عام", true),
      b("usr.local_archive", "الأرشيف محلي في جهاز في الفرع وليس السيرفر", "عام", false),
      b("usr.save_cards_server", "حفظ بطائق الحسابات في السيرفر", "عام", true),
    ],
  },
  {
    id: "ledger",
    label: "الحسابات",
    branch: [
      b("acc.print_receiver_card_pay", "طباعة بطاقة المستلم في سند صرف عملاء", "الطباعة", false),
      b("acc.qr_branch_pay", "طباعة الكيو ار في سند صرف بين الفروع", "الطباعة", true),
      b("acc.qr_pay", "طباعة الكيو ار في سند صرف عملاء", "الطباعة", true),
      b("acc.qr_multi_pay", "طباعة الكيو ار في سند صرف متعدد", "الطباعة", true),
      b("acc.balance_pay", "طباعة رصيد العميل في سند صرف عملاء", "الطباعة", false),
      b("acc.balance_receipt", "طباعة رصيد العميل في سند قبض عملاء", "الطباعة", false),
      b("acc.kodex_receipt", "طباعة قبض عملاء بطابعة كودكس", "الطباعة", false),
      b("acc.hide_zero", "إخفاء الأرصدة الصفرية في ميزان المراجعة وقائمة المركز المالي", "عام", true),
      b("acc.sms_on_confirm_print", "ارسال رسالة نصية عند طباعة المصادقة", "عام", true),
      b("acc.show_detail_accounts", "إظهار الحسابات التفصيلية في دليل الحسابات", "عام", false),
      b("acc.auto_post_pay", "اعتماد الترحيل في الصرف النقدي بشكل تلقائي", "عام", true),
      b("acc.auto_post_receipt", "اعتماد الترحيل في القبض النقدي بشكل تلقائي", "عام", true),
      b("acc.auto_post_simple", "اعتماد الترحيل في القيد البسيط بشكل تلقائي", "عام", true),
      b("acc.auto_post_double", "اعتماد الترحيل في القيد الثنائي بشكل تلقائي", "عام", true),
      n("acc.dormant_days", "المدة الزمنية باليوم لتوقيف الحسابات الخاملة تلقائيا", "عام", 30),
      b("acc.req_notes", "المطالبة بإدخال الملاحظات في السندات", "عام", false, true),
      b("acc.req_handler", "المطالبة بإدخال المناولة في السندات", "عام", true),
      b("acc.auto_commission_simple", "جلب العمولة تلقائيا في سند قيد بسيط", "عام", true),
      b("acc.merge_commission", "دمج العمولة مع المبلغ في سند قيد بسيط", "عام", false),
      n("acc.commission_account", "رقم حساب العمولة لسند قيد بسيط", "عام", 0),
      n("acc.inventory_diff_account", "رقم حساب ترحيل فارق الجرد", "عام", 0, true),
      n("acc.treasury_box_account", "رقم حساب صندوق الخزنة الرئيسية - سند إقفال صندوق", "عام", 0),
      n("acc.statement_decimals", "عدد خانات التقريب لعرض المبالغ في كشف الحساب", "عام", 2),
      b("acc.filter_cost_center", "فلترة الحسابات في تقرير مراكز التكلفة", "عام", true),
      n("acc.elec_last_day", "اخر يوم لتسديد فواتير الكهرباء", "فواتير الكهرباء", 25),
      n("acc.elec_first_day", "اول يوم لتسديد فواتير الكهرباء", "فواتير الكهرباء", 1),
      n("acc.elec_percent", "نسبة تسديد فواتير الكهرباء%", "فواتير الكهرباء", 100),
      n("acc.water_last_day", "اخر يوم لتسديد فواتير المياة", "فواتير المياة", 25),
      n("acc.water_first_day", "اول يوم لتسديد فواتير المياة", "فواتير المياة", 1),
      n("acc.water_percent", "نسبة تسديد فواتير المياة%", "فواتير المياة", 100),
    ],
    user: [],
  },
  {
    id: "transfers",
    label: "الحوالات",
    branch: [
      n("trf.commission_account", "رقم حساب إيراد عمولات الحوالات", "الترحيل", 0, true),
      n("trf.commission_settlement_account", "رقم حساب تسوية عمولة الحوالات بالشيك", "الترحيل", 0, true),
      b("trf.qr_pay", "طباعة الكيو ار في سند صرف حوالة", "صرف الحوالات", true),
      s("trf.search_mode", "طريقة البحث في اختيار الحوالة", "صرف الحوالات", ["البحث يحتوي", "البحث يبدأ بـ"], "البحث يحتوي"),
      s("trf.default_pay_method", "طريقة الصرف الإفتراضية", "صرف الحوالات", ["نقد", "حساب"], "نقد", true),
      b("trf.auto_show_choose", "عرض اختيار الحوالة في صرف الحوالات بشكل تلقائي", "صرف الحوالات", false),
      b("trf.show_card_before_print", "عرض بطاقة المستلم قبل طباعة سند صرف الحوالة", "صرف الحوالات", true),
      b("trf.show_all_on_open", "عرض كافة الحوالات تحت الصرف عند فتح اختيار حوالة", "صرف الحوالات", true),
      b("trf.check_card_expiry", "فحص تاريخ انتهاء بطاقة المستلم قبل صرف الحوالة", "صرف الحوالات", false),
      b("trf.check_names_branch", "فحص سماحية الصرف بإسم المستلم والمرسل في الفرع", "صرف الحوالات", false),
      b("trf.phone9", "اجباري رقم الهاتف 9 أرقام", "عام", false, true),
      b("trf.sender_phone_statement", "إظهار هاتف المرسل في الكشف الصادر", "عام", false),
      b("trf.receiver_phone_statement", "إظهار هاتف المستلم في الكشف الصادر", "عام", false),
      b("trf.auto_post_export", "اعتماد الترحيل في تصدير الحوالات بشكل تلقائي", "عام", true),
      b("trf.auto_approve_supply", "اعتماد الحوالة في توريد الحوالات بشكل تلقائي", "عام", true),
      b("trf.auto_approve_receipt", "اعتماد الحوالة في قبض الحوالات بشكل تلقائي", "عام", true),
      b("trf.autocomplete_names", "الاكمال التلقائي للمستلم والمرسل", "عام", true),
      b("trf.autocomplete_notes", "الاكمال التلقائي للملاحظات", "عام", true),
      n("trf.gov_stamp", "الدمغة الحكومية", "عام", 500),
      b("trf.req_sender_phone", "المطالبة بإدخال هاتف المرسل", "عام", false, true),
      b("trf.req_receiver_phone", "المطالبة بإدخال هاتف المستلم", "عام", false, true),
      b("trf.names4", "المطالبة بأن يكون اسم المستلم والمرسل يحتوي أربعة أسماء فأكثر", "عام", false, true),
      b("trf.names3", "المطالبة بأن يكون اسم المستلم والمرسل يحتوي ثلاثة اسماء فأكثر", "عام", false, true),
      b("trf.warn_unapproved", "تنبيه بوجود حوالات غير معتمدة", "عام", true),
      n("trf.pahmoney_account", "رقم حساب خدمة باه موني", "عام", 0),
      b("trf.kodex_export", "طباعة التصدير بطابعة كودكس", "عام", true),
      n("trf.commission_decimals", "عدد خانات التقريب للعمولة", "عام", 2),
      b("trf.no_sms_stopped", "عدم إرسال رسالة للمستلم لحوالة مقيدة بمنع استعلام أو إخراج إلا بعد حذفها من التوقيف", "عام", false),
      b("trf.sender_by_phone", "عرض اسم المرسل بواسطة رقم هاتفه", "عام", true),
      b("trf.receiver_by_phone", "عرض اسم المستلم بواسطة رقم هاتفه", "عام", true),
      b("trf.sender_phone_by_account", "عرض رقم المرسل بواسطة حساب القبض", "عام", true),
      n("trf.force_convert_above", "عرض التحويل اجباري اذا كان المبلغ أكبر من", "عام", 0),
      b("trf.filter_accounts_by_method", "فلترة الحسابات بحسب طريقة القبض في قبض الحوالات", "عام", true),
      n("trf.gov_stamp_usd", "مبلغ إحتساب الدمغة الحكومية بالدولار", "عام", 100),
      n("trf.notes_required_above", "ملاحظات القبض اجباري اذا كان المبلغ أكبر من", "عام", 0, true),
      n("trf.pay_commission_diff", "نسبة فارق عمولة صرف الحوالات%", "عام", 0),
      b("trf.req_relation", "اجباري ادخال صلة القرابة في قبض وتوريد الحوالات", "قبض الحوالات", false),
      b("trf.print_ref_debit", "طباعة الرقم المرجعي في إشعار مدين قبض حوالة", "قبض الحوالات", false),
      b("trf.req_sender_card", "اجباري ادخال بطاقة المرسل في قبض الحوالات", "قبض الحوالات", false, true),
      b("trf.hide_commission_account", "إخفاء العمولة في طباعة سند قبض حوالة من حساب", "قبض الحوالات", false),
      b("trf.hide_number", "إخفاء رقم الحوالة من سند قبض حوالة", "قبض الحوالات", false),
      t("trf.default_currency", "العملة الإفتراضية في قبض الحوالات", "قبض الحوالات", "ريال يمني"),
      b("trf.store_general_number", "تخزين الرقم العام في ملاحظات القيد لقبض الحوالات", "قبض الحوالات", true),
      b("trf.store_supply_notes", "تخزين ملاحظات التوريد في قيد الصرف للحوالات", "قبض الحوالات", true),
      b("trf.sort_asc", "ترتيب البيانات في قبض الحوالات تصاعديا", "قبض الحوالات", true),
      n("trf.usd_multi_ext", "رقم عملة الدولار لتوريد حوالات خارجية متعدد (الإدارة)", "قبض الحوالات", 3),
      n("trf.sar_multi_ext", "رقم عملة الريال السعودي لتوريد حوالات خارجية متعدد (الإدارة)", "قبض الحوالات", 2),
      b("trf.print_source_in_notes", "طباعة جهة الصادر حال اختلفت عن جهة الحوالة في الملاحظات", "قبض الحوالات", true),
      b("trf.new_cash_template", "طباعة سند قبض حوالة نقد بالقالب الجديد", "قبض الحوالات", true),
      s("trf.default_receipt_method", "طريقة القبض الإفتراضية", "قبض الحوالات", ["نقد", "حساب"], "نقد", true),
      b("trf.receipt_base_currency", "عملة القبض في قبض الحوالات دائما بالعملة الأساسية", "قبض الحوالات", true),
    ],
    user: [],
  },
  {
    id: "checks",
    label: "الشيكات",
    branch: [n("chk.due_alert_days", "فترة تنبية بالشيكات المستحقة (بالأيام، -1 = بدون)", "عام", -1)],
    user: [],
  },
  {
    id: "exchange",
    label: "البيع و الشراء",
    branch: [
      n("exc.commission_account", "رقم حساب إيراد عمولات البيع والشراء", "الترحيل", 0, true),
      b("exc.kodex_sell_twice", "طباعة فاتورة البيع مرتين بواسطة كودكس", "الطباعة", false),
      b("exc.kodex_both", "طباعة فاتورة البيع و الشراء على طابعة كودكس", "الطباعة", false),
      b("exc.kodex_buy_twice", "طباعة فاتورة الشراء مرتين بواسطة كودكس", "الطباعة", false),
      n("exc.acc_banks", "رقم حساب البنوك", "تقارير البنك", 1212),
      n("exc.acc_checks", "رقم حساب الشيكات", "تقارير البنك", 1213),
      n("exc.acc_boxes", "رقم حساب الصناديق", "تقارير البنك", 1211),
      b("exc.req_customer", "اجباري اسم الزبون في البيع والشراء", "عام", false, true),
      b("exc.req_cash_customer", "اجباري اسم الزبون في البيع والشراء النقدي", "عام", false, true),
      b("exc.auto_post_sell", "اعتماد الترحيل في بيع العملات بشكل تلقائي", "عام", true),
      b("exc.auto_post_buy", "اعتماد الترحيل في شراء العملات بشكل تلقائي", "عام", true),
      b("exc.refresh_price", "تحديث سعر البيع أو الشراء عند تغيير عملة القيمة", "عام", true),
      b("exc.refresh_price_android", "تحديث سعر البيع أو الشراء عند تغيير عملة القيمة للاندرويد", "عام", true),
      n("exc.sell_offer_above", "عرض البيع إجباري اذا كان المبلغ أكبر من", "عام", 1000000),
      b("exc.sell_cash_offer", "عرض البيع النقدي إجباري", "عام", false),
      n("exc.buy_offer_above", "عرض الشراء إجباري اذا كان المبلغ أكبر من", "عام", 1000000),
      b("exc.buy_cash_offer", "عرض الشراء النقدي إجباري", "عام", false),
    ],
    user: [],
  },
  {
    id: "sms",
    label: "الرسائل النصية",
    branch: [
      b("sms.shop_name", "إرسال اسم منشأة الصرافة في الرسائل النصية للحوالات", "الرسائل القصيرة", true),
      b("sms.statement", "إرسال البيان مع الرسائل القصيرة للحسابات", "الرسائل القصيرة", false),
      b("sms.first70", "إرسال أول 70 حرف من الرسالة فقط (رسالة نصية واحدة فقط)", "الرسائل القصيرة", true),
      b("sms.receiver_on_export", "إرسال رسالة نصية الى المستلم من تصدير الحوالات", "الرسائل القصيرة", false),
      b("sms.receiver_on_supply", "إرسال رسالة نصية الى المستلم من توريد الحوالات", "الرسائل القصيرة", false),
      b("sms.to_sender", "إرسال رسالة نصية الى مرسل الحوالة", "الرسائل القصيرة", false),
      b("sms.to_receiver", "إرسال رسالة نصية الى مستلم الحوالة", "الرسائل القصيرة", false),
      b("sms.balance", "إرسال رصيد الحساب", "الرسائل القصيرة", false),
      b("sms.doc_number", "إرسال رقم المستند", "الرسائل القصيرة", false),
      b("sms.agent", "إرسال وكيل الجهة في رسالة المستلم", "الرسائل القصيرة", false),
      b("sms.no_balance_first", "عدم إرسال الرصيد في بداية الرسائل النصية للحسابات", "الرسائل القصيرة", true),
      b("sms.currency_code", "كتابة رمز عملة الرصيد بدلا عن إسم العملة", "الرسائل القصيرة", false),
    ],
    user: [],
  },
];

export const ALL_SETTINGS: readonly SettingItem[] = SETTINGS_TREE.flatMap((x) => [...x.branch, ...x.user]);
const BY_KEY = new Map(ALL_SETTINGS.map((i) => [i.key, i]));

export type SettingRow = { scope: SettingScope; owner: string; key: string; value: SettingValue };

/** يحسب القيمة النهائية: المستخدم ← فرعه ← كل الفروع ← الافتراضي. */
export function resolveSetting(key: string, rows: readonly SettingRow[], ctx: { userId?: string | null; branchId?: number | null }): SettingValue {
  const item = BY_KEY.get(key);
  if (!item) throw new Error(`إعداد غير معروف: ${key}`);
  const find = (scope: SettingScope, owner: string) => rows.find((r) => r.scope === scope && r.owner === owner && r.key === key);
  const hit = (ctx.userId ? find("user", ctx.userId) : undefined)
    ?? (ctx.branchId != null ? find("branch", String(ctx.branchId)) : undefined)
    ?? find("branch", "all");
  if (!hit) return item.def;
  if (item.type === "bool") return hit.value === true;
  if (item.type === "number") return Number.isFinite(Number(hit.value)) ? Number(hit.value) : item.def;
  return String(hit.value);
}

/** تحقق بنود الحوالة المفعّلة. يعيد رسالة الخطأ الأولى أو null. */
export function transferRuleError(get: (k: string) => SettingValue, f: { sender: string; sender_phone: string; receiver: string; receiver_phone: string; amount: number; notes: string; identity?: string }, dir: "outgoing" | "incoming"): string | null {
  const words = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
  if (get("trf.req_sender_phone") && !f.sender_phone.trim()) return "أدخل هاتف المرسل (مطلوب في الإعدادات)";
  if (get("trf.req_receiver_phone") && !f.receiver_phone.trim()) return "أدخل هاتف المستلم (مطلوب في الإعدادات)";
  if (get("trf.phone9")) {
    for (const p of [f.sender_phone, f.receiver_phone]) {
      const d = p.replace(/\D/g, "");
      if (d && d.length !== 9) return "رقم الهاتف يجب أن يكون 9 أرقام";
    }
  }
  const min = get("trf.names4") ? 4 : get("trf.names3") ? 3 : 0;
  if (min && (words(f.sender) < min || words(f.receiver) < min)) return `اسم المرسل والمستلم يجب أن يحتوي ${min} أسماء فأكثر`;
  const limit = Number(get("trf.notes_required_above"));
  if (dir === "outgoing" && limit > 0 && f.amount > limit && !f.notes.trim()) return `الملاحظات إجبارية للمبالغ الأكبر من ${limit}`;
  if (dir === "outgoing" && get("trf.req_sender_card") && !(f.identity ?? "").trim()) return "أدخل رقم بطاقة المرسل (مطلوب في الإعدادات)";
  return null;
}

/** تحقق اسم الزبون في البيع والشراء. */
export function exchangeRuleError(get: (k: string) => SettingValue, method: string, customer: string): string | null {
  if (method === "cash" && (get("exc.req_cash_customer") || get("exc.req_customer")) && !customer.trim()) return "أدخل اسم الزبون (مطلوب في الإعدادات)";
  return null;
}

export const payMethodValue = (label: SettingValue) => (label === "حساب" ? "account" : "cash");
