import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Percent } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Field,
  FormCard,
  ListItem,
  LoadingRows,
  Notice,
  StatusPill,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/commissions")({
  head: () => ({
    meta: [
      { title: "نظام العمولات — ابو طه للصرافة" },
      { name: "description", content: "قواعد عمولات الحوالات والبيع والشراء حسب العملة والوكيل والمبلغ." },
      { property: "og:title", content: "نظام العمولات — ابو طه للصرافة" },
      { property: "og:description", content: "قواعد عمولات الحوالات والبيع والشراء حسب العملة والوكيل والمبلغ." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommissionsScreen,
});

const DOC_TYPES: Record<string, string> = {
  outgoing: "حوالة صادرة",
  incoming: "حوالة واردة",
  buy: "شراء عملة",
  sell: "بيع عملة",
};

export function useCommissionRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_rules")
        .select("*, currencies!currency_id(currency_name), agents(agent_name)")
        .order("document_type")
        .order("id");
      if (error) throw error;
      return data;
    },
  });
}

function CommissionsScreen() {
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useCommissionRules();
  const { isLoading: rolesLoading, canManageCommissions } = useAppRoles();

  return (
    <>
      <MenuStrip tab="/exchange" />
      <SectionIntro
        title="نظام العمولات"
        subtitle="تُحسب العمولة تلقائيًا عند إدخال الحوالة حسب نوع المستند والعملة والوكيل وشريحة المبلغ."
      />
      {canManageCommissions ? (
        <>
          <div className="mb-4">
            <Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "قاعدة عمولة جديدة"}</Button>
          </div>
          {open && <RuleForm onDone={() => setOpen(false)} />}
        </>
      ) : (
        !rolesLoading && (
          <Notice tone="info" className="mb-4">
            إضافة قواعد العمولات وتعديلها متاحة للمدير فقط. يمكنك قراءة القواعد الحالية، وتُحسب العمولة تلقائيًا في الحوالات.
          </Notice>
        )
      )}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="لا توجد قواعد عمولات بعد"
          hint="يضيف المدير أول قاعدة، أو تُنقل قواعدك من النظام القديم عند وصول بياناتها."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <ListItem key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <StatusPill tone="ok">{DOC_TYPES[r.document_type] ?? r.document_type}</StatusPill>
                <span className="ledger-figures text-sm font-semibold text-primary">
                  {r.method === "percent" ? `${fmt(Number(r.commission_value))}٪` : fmt(r.commission_value)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  العملة: <span className="text-foreground">{(r.currencies as { currency_name: string } | null)?.currency_name ?? "كل العملات"}</span>
                </span>
                <span className="min-w-0 truncate">
                  الوكيل: <span className="text-foreground">{(r.agents as { agent_name: string } | null)?.agent_name ?? "كل الوكلاء"}</span>
                </span>
                {(r.amount_from != null || r.amount_to != null) && (
                  <span className="ledger-figures min-w-0 truncate">
                    الشريحة: من {fmt(r.amount_from ?? 0)} إلى {r.amount_to != null ? fmt(r.amount_to) : "∞"}
                  </span>
                )}
                {(r.min_commission != null || r.max_commission != null) && (
                  <span className="ledger-figures min-w-0 truncate">
                    الحد الأدنى {fmt(r.min_commission)} · الأقصى {r.max_commission != null ? fmt(r.max_commission) : "—"}
                  </span>
                )}
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function RuleForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    document_type: "outgoing", currency_id: "", agent_id: "", amount_from: "", amount_to: "",
    method: "percent", value: "", min: "", max: "", notes: "",
  });
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, agent_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("commission_rules").insert({
        document_type: f.document_type,
        currency_id: num(f.currency_id),
        agent_id: num(f.agent_id),
        amount_from: num(f.amount_from),
        amount_to: num(f.amount_to),
        method: f.method,
        commission_value: Number(f.value),
        min_commission: num(f.min),
        max_commission: num(f.max),
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("حُفظت القاعدة"); qc.invalidateQueries({ queryKey: ["commission_rules"] }); onDone(); },
    onError: () => toast.error("تعذّر الحفظ — إضافة القواعد للمدير فقط"),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع المستند">
          <select className={selectCls} value={f.document_type} onChange={set("document_type")}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="طريقة الحساب">
          <select className={selectCls} value={f.method} onChange={set("method")}>
            <option value="percent">نسبة مئوية</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="العملة">
          <select className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
            <option value="">كل العملات</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
        <Field label="الوكيل">
          <select className={selectCls} value={f.agent_id} onChange={set("agent_id")}>
            <option value="">كل الوكلاء</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={f.method === "percent" ? "النسبة ٪" : "مبلغ العمولة"}>
        <Input required inputMode="decimal" placeholder={f.method === "percent" ? "مثال: 10" : "مثال: 5000"} value={f.value} onChange={set("value")} className="ledger-figures" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ من">
          <Input inputMode="decimal" placeholder="أقل مبلغ" value={f.amount_from} onChange={set("amount_from")} className="ledger-figures" />
        </Field>
        <Field label="المبلغ إلى">
          <Input inputMode="decimal" placeholder="أعلى مبلغ" value={f.amount_to} onChange={set("amount_to")} className="ledger-figures" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الحد الأدنى للعمولة">
          <Input inputMode="decimal" placeholder="اختياري" value={f.min} onChange={set("min")} className="ledger-figures" />
        </Field>
        <Field label="الحد الأقصى للعمولة">
          <Input inputMode="decimal" placeholder="اختياري" value={f.max} onChange={set("max")} className="ledger-figures" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Input placeholder="بيان القاعدة" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending}>حفظ القاعدة</Button>
    </FormCard>
  );
}
