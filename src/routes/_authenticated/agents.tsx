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

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "الوكلاء — ابو طه للصرافة" }, { name: "description", content: "دليل وكلاء الحوالات وبيانات التواصل وكشوف حساباتهم." }, { property: "og:title", content: "الوكلاء — ابو طه للصرافة" }, { property: "og:description", content: "دليل وكلاء الحوالات وبيانات التواصل وكشوف حساباتهم." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentsScreen,
});

type Agent = { id: number; the_number: number; agent_name: string; phone: string | null; address: string | null; classification_id: number | null };

function AgentsScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, the_number, agent_name, phone, address, classification_id")
        .order("the_number");
      if (error) throw error;
      return data as Agent[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("agents").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُذف الوكيل"); qc.invalidateQueries({ queryKey: ["agents"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((a) => a.agent_name.includes(term) || String(a.the_number).includes(term) || (a.phone ?? "").includes(term))
    : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="الوكلاء" subtitle="وكلاء الشبكة الخارجية الذين تُرسل وتُستلم عبرهم الحوالات." />
      <Toolbar
        search={<Input placeholder="بحث بالاسم أو الرقم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />}
        action={isManager && <Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة وكيل"}</Button>}
      />
      {open && <AgentForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Users}
          title={data.length === 0 ? "لا يوجد وكلاء بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول وكيل ليُفتح له حساب في الشجرة." : "جرّب البحث باسم أو رقم أو هاتف آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((a) => (
            <ListItem key={a.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{a.the_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.agent_name}</span>
                <span className="ledger-figures shrink-0 text-xs text-muted-foreground">{a.phone ?? ""}</span>
              </div>
              {a.address && <p className="mt-1 text-xs text-muted-foreground">{a.address}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <RowActions
                  canEdit={isManager}
                  canDelete={isManager}
                  pending={del.isPending}
                  onEdit={() => setEditing(editing === a.id ? null : a.id)}
                  onDelete={() => del.mutate(a.id)}
                />
                <Link to="/statement" search={{ type: "agent", id: a.id }} className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary">
                  كشف حساب
                </Link>
              </div>
              {editing === a.id && <AgentForm initial={a} onDone={() => setEditing(null)} />}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function AgentForm({ initial, onDone }: { initial?: Agent; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: classes = [] } = useClassifications();
  const [f, setF] = useState({ number: "", name: initial?.agent_name ?? "", phone: initial?.phone ?? "", address: initial?.address ?? "", classification: initial?.classification_id ? String(initial.classification_id) : "" });
  const m = useMutation({
    mutationFn: async () => {
      const fields = { agent_name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null, classification_id: f.classification ? Number(f.classification) : null };
      if (initial) {
        const { data, error } = await supabase.from("agents").update(fields).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("agents").insert({ the_number: Number(f.number), ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيف الوكيل");
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الحفظ — الرقم أو الاسم مستخدم، أو لا تملك الصلاحية"),
  });
  return (
    <FormCard
      className={initial ? "mt-3 mb-0" : undefined}
      onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
    >
      {!initial && (
        <Field label="رقم الوكيل">
          <Input inputMode="numeric" placeholder="يُعيَّن تلقائيًا إذا تُرك فارغًا" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
      )}
      <Field label="اسم الوكيل">
        <Input required placeholder="مثال: وكيل المكلا" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="الهاتف">
        <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="ledger-figures" />
      </Field>
      <Field label="العنوان">
        <Input placeholder="المدينة / الشارع" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </Field>
      <Field label="التصنيف">
        <select className={selectCls} value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })}>
          <option value="">بدون تصنيف</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.classification_name}</option>)}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

/** التصنيفات (من شاشة التهيئة) التي تنطبق على الوكلاء. */
function useClassifications() {
  return useQuery({
    queryKey: ["classifications", "agent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classifications")
        .select("id, classification_name")
        .in("applies_to", ["agent", "both"])
        .order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}
