import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkDefaults } from "@/hooks/use-work-defaults";
import { defaultBoxId } from "@/lib/staff-defaults";

const LAST_BOX_KEY = "sarraf:last-box";
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function useBoxes() {
  return useQuery({
    queryKey: ["boxes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boxes").select("id, the_number, box_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
}

/** اختيار الصندوق الذي تُقبض منه أو تُصرف فيه النقدية، ويتذكر آخر صندوق استُخدم على هذا الجوال. */
export function BoxSelect({
  value,
  onChange,
  required,
  label = "الصندوق",
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  label?: string;
}) {
  const { data: boxes = [] } = useBoxes();
  const { data: defaults, isLoading: defaultsLoading } = useWorkDefaults();

  useEffect(() => {
    if (defaults?.enforce_box && defaults.box_id && value !== String(defaults.box_id)) { onChange(String(defaults.box_id)); return; }
    if (value || boxes.length === 0 || defaultsLoading) return;
    const last = window.localStorage.getItem(LAST_BOX_KEY);
    const pick = defaultBoxId(defaults?.box_id, last, boxes);
    if (pick) onChange(pick);
  }, [boxes, value, onChange, defaults, defaultsLoading]);

  return (
    <select
      required={required || defaults?.enforce_box}
      disabled={defaultsLoading || defaults?.enforce_box}
      aria-label={label}
      className={selectCls}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (e.target.value) window.localStorage.setItem(LAST_BOX_KEY, e.target.value);
      }}
    >
      <option value="">{boxes.length === 0 ? "لا توجد صناديق — أضف صندوقًا أولًا" : `${label}${required ? "" : " (اختياري)"}`}</option>
      {boxes.map((b) => (
        <option key={b.id} value={b.id}>
          {b.box_name}
        </option>
      ))}
    </select>
  );
}

/** رسالة مفهومة لأخطاء القاعدة الشائعة في عمليات الصندوق. */
export function boxErrorMessage(e: unknown, fallback = "تعذّر الحفظ — تأكد من البيانات وصلاحيتك"): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (msg.includes("هذه العملية تحتاج اتصالًا") || msg.includes("تعذّر الحفظ على الهاتف")) return msg;
  if (msg.includes("STAFF_PAST_DATE_DENIED")) return "غير مسموح لك بتسجيل عملية بتاريخ سابق";
  if (msg.includes("STAFF_FUTURE_DATE_DENIED")) return "غير مسموح لك بتسجيل عملية بتاريخ لاحق";
  if (msg.includes("STAFF_BOX_RESTRICTED")) return "يسمح لك بالعمل في الصندوق المحدد من المدير فقط";
  if (msg.includes("STAFF_CURRENCY_RESTRICTED")) return "يسمح لك بالعمل بالعملة المحددة من المدير فقط";
  if (msg.includes("TRANSFER_BOX_REQUIRED")) return "اختر صندوق القبض أو الصرف أولًا";
  if (msg.includes("INTERNAL_TRANSFER_DELIVER_INCOMING")) return "تُصرف الحوالة الداخلية من قائمة توريد / صرف فقط";
  if (msg.includes("INTERNAL_TRANSFER_CANCEL_OUTGOING")) return "ألغِ الحوالة الداخلية من الصادرة لإرجاع القبض";
  if (msg.includes("INVALID_INTERNAL_TRANSFER_STATE")) return "الحوالة الداخلية مصروفة أو ملغاة؛ حدّث القائمة";
  if (msg.includes("INTERNAL_TRANSFER_NO_EXPORT")) return "الحوالة الداخلية موجودة في صرف الحوالات ولا تحتاج تصديرًا للوكيل";
  if (msg.includes("TRANSFER_CUSTOMER_REQUIRED")) return "اختر عميلًا مرتبطًا بحساب في دليل الحسابات";
  if (msg.includes("EXCHANGE_CUSTOMER_REQUIRED")) return "اختر حساب العميل للبيع أو الشراء من الحساب";
  if (msg.includes("EXCHANGE_PAYMENT_IMMUTABLE")) return "لا يمكن تغيير طريقة الصرف أو مبالغ عملية مرحّلة على حساب؛ احذفها وأدخلها من جديد";
  if (msg.includes("TRANSFER_CHECK_AMOUNT_MISMATCH")) return "يجب أن تساوي قيمة الشيك مبلغ الحوالة والعمولة وبنفس العملة";
  if (msg.includes("TRANSFER_CHECK_REQUIRED")) return "اختر شيكًا واردًا صالحًا وغير مرتبط بحوالة أخرى";
  if (msg.includes("TRANSFER_CHECK_CANCEL_REQUIRES_SETTLEMENT")) return "حوالة الشيك تحتاج تسوية واضحة للشيك قبل الإلغاء";
  if (msg.includes("TRANSFER_CHECK_ALREADY_COLLECTED")) return "الشيك محصل؛ لا يمكن إعادة تحصيله أو تغيير صندوقه";
  if (msg.includes("TRANSFER_FINANCE_IMMUTABLE")) return "لا يمكن تعديل البيانات المالية لحوالة مسجلة";
  if (msg.includes("TRANSFER_REVERSE_FORBIDDEN")) return "لا يمكن التراجع عن التسليم أو إعادة حوالة ملغاة";
  if (msg.includes("TRANSFER_EXPORT_AGENT_REQUIRED")) return "اختر وكيل الحوالة قبل تصديرها";
  if (msg.includes("BOX_CLOSED")) return "الصندوق مقفل لهذا اليوم — اطلب من المدير إعادة فتحه";
  if (msg.includes("FORBIDDEN_CANCEL")) return "إلغاء الحوالة للمدير فقط";
  if (msg.includes("DELIVERED")) return "لا تُلغى حوالة مسلّمة";
  if (msg.includes("CANCELED")) return "الحوالة ملغاة";
  return fallback;
}
