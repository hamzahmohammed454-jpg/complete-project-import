import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { Field, selectCls } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export type StaffWorkFieldsValue = { branch_id: string; box_id: string; currency_id: string; enforce_box: boolean; enforce_currency: boolean; allow_past_date: boolean; allow_future_date: boolean; allow_buy: boolean; allow_sell: boolean };

export function StaffWorkFields({ value, onChange }: { value: StaffWorkFieldsValue; onChange: (value: StaffWorkFieldsValue) => void }) {
  const { data } = useQuery({
    queryKey: ["staff-work-options"],
    queryFn: async () => {
      const [branches, boxes, currencies] = await Promise.all([
        supabase.from("branches").select("id, branch_name").order("the_number"),
        supabase.from("boxes").select("id, box_name, branch_id").order("the_number"),
        supabase.from("currencies").select("id, currency_name").order("the_number"),
      ]);
      if (branches.error) throw branches.error;
      if (boxes.error) throw boxes.error;
      if (currencies.error) throw currencies.error;
      return { branches: branches.data, boxes: boxes.data, currencies: currencies.data };
    },
  });
  return (
    <div className="grid gap-3">
      <Field label="الفرع الافتراضي">
        <select aria-label="الفرع الافتراضي" className={selectCls} value={value.branch_id} onChange={(e) => onChange({ ...value, branch_id: e.target.value, box_id: "" })}>
          <option value="">غير محدد</option>
          {data?.branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الصندوق الافتراضي">
          <select aria-label="الصندوق الافتراضي" className={selectCls} value={value.box_id} onChange={(e) => onChange({ ...value, box_id: e.target.value })}>
            <option value="">غير محدد</option>
            {data?.boxes.filter((b) => !value.branch_id || b.branch_id === Number(value.branch_id)).map((b) => <option key={b.id} value={b.id}>{b.box_name}</option>)}
          </select>
        </Field>
        <Field label="العملة الافتراضية">
          <select aria-label="العملة الافتراضية" className={selectCls} value={value.currency_id} onChange={(e) => onChange({ ...value, currency_id: e.target.value })}>
            <option value="">غير محددة</option>
            {data?.currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.enforce_box} onCheckedChange={(checked) => onChange({ ...value, enforce_box: checked === true })} />إلزام المستخدم بالصندوق المحدد</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.enforce_currency} onCheckedChange={(checked) => onChange({ ...value, enforce_currency: checked === true })} />إلزام المستخدم بالعملة المحددة</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.allow_past_date} onCheckedChange={(checked) => onChange({ ...value, allow_past_date: checked === true })} />السماح بتسجيل عمليات بتاريخ سابق</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.allow_future_date} onCheckedChange={(checked) => onChange({ ...value, allow_future_date: checked === true })} />السماح بتسجيل عمليات بتاريخ لاحق</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.allow_buy} onCheckedChange={(checked) => onChange({ ...value, allow_buy: checked === true })} />السماح بشراء العملات</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.allow_sell} onCheckedChange={(checked) => onChange({ ...value, allow_sell: checked === true })} />السماح ببيع العملات</label>
    </div>
  );
}