import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { RowActions } from "@/components/row-actions";
import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, FormCard, ListItem, LoadingRows, Toolbar, selectCls } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { CustomerImport } from "@/components/customer-import";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { pendingResult } from "@/lib/offline/outbox-core";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "العملاء — ابو طه للصرافة" }, { name: "description", content: "ملفات العملاء وأرقام هواتفهم واستيراد سجل العملاء ومراجعة كشوفهم." }, { property: "og:title", content: "العملاء — ابو طه للصرافة" }, { property: "og:description", content: "ملفات العملاء واستيراد أسمائهم وهواتفهم وكشوف الحساب." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CustomersScreen,
});

type Customer = { id: number; the_user_id: number | null; full_name: string; phone_number: string | null; classification_id: number | null; credit_limit: number | null; stopped: boolean; stop_reason: string | null };

function CustomersScreen() {
  const qc = useQueryClient();
  const { canDeleteCustomers } = useAppRoles();
  const permissions = useScreenPermissions("/customers");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, the_user_id, full_name, phone_number, classification_id, credit_limit, stopped, stop_reason")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُذف العميل"); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((c) => c.full_name.includes(term) || (c.phone_number ?? "").includes(term) || String(c.the_user_id ?? "").includes(term))
    : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="العملاء" subtitle="ملف كل عميل: اسمه وهاتفه ورقمه، مرتبطًا بحسابه في الشجرة." />
      <Toolbar
        search={<Input placeholder="بحث بالاسم أو الهاتف أو الرقم" value={q} onChange={(e) => setQ(e.target.value)} />}
        action={permissions.can("create") ? <Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة عميل"}</Button> : null}
      />
      <CustomerImport />
      {open && <CustomerForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Users}
          title={data.length === 0 ? "لا يوجد عملاء بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول عميل ليُفتح له حساب في الشجرة." : "جرّب البحث باسم أو هاتف أو رقم آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((c) => (
            <ListItem key={c.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{c.the_user_id ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.full_name}</span>
                {c.stopped && <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">موقوف</span>}
                <span className="ledger-figures shrink-0 text-xs text-muted-foreground">{c.phone_number ?? ""}</span>
              </div>
              {(c.credit_limit != null || (c.stopped && c.stop_reason)) && (
                <p className="ledger-figures mt-1 text-[11px] text-muted-foreground">
                  {c.credit_limit != null && `سقف الائتمان: ${c.credit_limit.toLocaleString("en-US")}`}
                  {c.stopped && c.stop_reason && ` — سبب التوقيف: ${c.stop_reason}`}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <RowActions
                  canEdit={permissions.can("update")}
                  canDelete={canDeleteCustomers && permissions.can("delete")}
                  pending={del.isPending}
                  onEdit={() => setEditing(editing === c.id ? null : c.id)}
                  onDelete={() => del.mutate(c.id)}
                />
                <Link to="/statement" search={{ type: "customer", id: c.id }} className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-primary">
                  كشف حساب
                </Link>
              </div>
              {editing === c.id && <CustomerForm initial={c} onDone={() => setEditing(null)} />}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function CustomerForm({ initial, onDone }: { initial?: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: classes = [] } = useClassifications();
  const [f, setF] = useState({ number: "", name: initial?.full_name ?? "", phone: initial?.phone_number ?? "", classification: initial?.classification_id ? String(initial.classification_id) : "", credit_limit: initial?.credit_limit != null ? String(initial.credit_limit) : "", stopped: initial?.stopped ?? false, stop_reason: initial?.stop_reason ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      if (initial) {
        const { data, error } = await supabase
          .from("customers")
          .update({ full_name: f.name.trim(), phone_number: f.phone.trim() || null, classification_id: f.classification ? Number(f.classification) : null, credit_limit: f.credit_limit ? Number(f.credit_limit) : null, stopped: f.stopped, stop_reason: f.stopped ? f.stop_reason.trim() || null : null })
          .eq("id", initial.id)
          .select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { data, error } = await supabase.from("customers").insert({
        the_user_id: f.number ? Number(f.number) : null,
        full_name: f.name.trim(),
        phone_number: f.phone.trim() || null,
        classification_id: f.classification ? Number(f.classification) : null,
        credit_limit: f.credit_limit ? Number(f.credit_limit) : null,
      }).select("id").setHeader("x-offline-intent", "true");
      if (error) throw error;
      return pendingResult(data);
    },
    onSuccess: (pending) => {
      if (pending) toast.info("حُفظ العميل على الهاتف بانتظار الإرسال؛ لم يُفتح حسابه النهائي بعد. راجع قائمة المزامنة.");
      else toast.success(initial ? "حُفظ التعديل" : "أُضيف العميل");
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
    onError: (e) => { const message = typeof e === "object" && e && "message" in e ? String(e.message) : ""; toast.error(message.includes("هذه العملية تحتاج اتصالًا") || message.includes("تعذّر الحفظ على الهاتف") ? message : initial ? editErrorMessage(e) : "تعذّر الحفظ — الرقم أو الهاتف مستخدم لعميل آخر"); },
  });
  return (
    <FormCard
      className={initial ? "mt-3 mb-0" : undefined}
      onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
    >
      {!initial && (
        <Field label="رقم العميل">
          <Input inputMode="numeric" placeholder="يُعيَّن تلقائيًا إذا تُرك فارغًا" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
      )}
      <Field label="الاسم الكامل">
        <Input required placeholder="مثال: أحمد محمد" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="رقم الهاتف">
        <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="ledger-figures" />
      </Field>
      <Field label="التصنيف">
        <select className={selectCls} value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })}>
          <option value="">بدون تصنيف</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.classification_name}</option>)}
        </select>
      </Field>
      <Field label="سقف الائتمان (اتركه فارغًا بلا سقف)">
        <Input inputMode="decimal" placeholder="أعلى مبلغ دين مسموح" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} className="ledger-figures" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.stopped} onChange={(e) => setF({ ...f, stopped: e.target.checked })} />
        إيقاف الحساب (يرفض أي عملية جديدة للعميل)
      </label>
      {f.stopped && (
        <Field label="سبب التوقيف">
          <Input value={f.stop_reason} onChange={(e) => setF({ ...f, stop_reason: e.target.value })} />
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

/** التصنيفات (من شاشة التهيئة) التي تنطبق على العملاء. */
function useClassifications() {
  return useQuery({
    queryKey: ["classifications", "customer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classifications")
        .select("id, classification_name")
        .in("applies_to", ["customer", "both"])
        .order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}
