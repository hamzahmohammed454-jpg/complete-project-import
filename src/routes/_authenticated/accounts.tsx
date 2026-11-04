import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { RowActions } from "@/components/row-actions";
import { PendingNote, SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, FormCard, LoadingRows, Toolbar, selectCls } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { buildAccountTree, type AccountNode } from "@/lib/account-tree";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "شجرة الحسابات — ابو طه للصرافة" }, { name: "description", content: "دليل الحسابات الرئيسي والفرعي وربط حسابات العملاء والوكلاء والصناديق." }, { property: "og:title", content: "شجرة الحسابات — ابو طه للصرافة" }, { property: "og:description", content: "دليل الحسابات الرئيسي والفرعي وربط حسابات العملاء والوكلاء والصناديق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AccountsScreen,
});

function AccountsScreen() {
  const qc = useQueryClient();
  const { canManageAccounts } = useAppRoles();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_number, father_number, account_name, account_type, group_id, ceiling_amount, ceiling_currency_id, account_groups(group_name)")
        .order("account_number");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, group_name: r.account_groups?.group_name ?? null }));
    },
  });

  const tree = useMemo(() => buildAccountTree(data), [data]);

  // صافي كل حساب بكل عملة من القيود — لمقارنته بسقف الحساب
  const { data: moves = [] } = useQuery({
    queryKey: ["account_moves"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entries_details").select("account_id, currency_id, side, amount");
      if (error) throw error;
      return data ?? [];
    },
  });
  const nets = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of moves) {
      if (r.account_id == null) continue;
      const k = `${r.account_id}|${r.currency_id ?? 0}`;
      m.set(k, (m.get(k) ?? 0) + (r.side === "مدين" ? Number(r.amount) : -Number(r.amount)));
    }
    return m;
  }, [moves]);
  const overCeiling = useMemo(() => {
    const s = new Set<number>();
    for (const a of data) {
      if (a.ceiling_amount != null && (nets.get(`${a.id}|${a.ceiling_currency_id ?? 0}`) ?? 0) > a.ceiling_amount) s.add(a.id);
    }
    return s;
  }, [data, nets]);

  const term = q.trim();
  const matches = term
    ? data.filter((r) => r.account_name.includes(term) || String(r.account_number).includes(term))
    : null;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="شجرة الحسابات" subtitle="الحسابات الرئيسة والفرعية بأرقامها كما في نظامك." />
      <Toolbar
        search={<Input placeholder="بحث برقم الحساب أو اسمه" value={q} onChange={(e) => setQ(e.target.value)} />}
        action={canManageAccounts && <Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة حساب"}</Button>}
      />
      {open && <NewAccountForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["accounts"] }); }} />}
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : data.length === 0 ? (
        <PendingNote text="لا توجد حسابات بعد. ستُنقل شجرة حساباتك بأرقامها من نظامك القديم عند وصول بيانات جدول الحسابات، أو أضف حسابًا يدويًا." />
      ) : matches ? (
        matches.length === 0 ? (
          <EmptyState icon={Search} title="لا نتائج مطابقة للبحث" hint="جرّب البحث برقم حساب أو اسم آخر." />
        ) : (
          <ul className="space-y-2">{matches.map((m) => <Row key={m.id} node={{ ...m, children: [] }} depth={0} canManage={canManageAccounts} overCeiling={overCeiling} />)}</ul>
        )
      ) : (
        <ul className="space-y-2">{tree.map((n) => <Branch key={n.id} node={n} depth={0} canManage={canManageAccounts} overCeiling={overCeiling} />)}</ul>
      )}
    </>
  );
}

function Branch({ node, depth, canManage, overCeiling }: { node: AccountNode; depth: number; canManage: boolean; overCeiling: ReadonlySet<number> }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <li>
      <Row node={node} depth={depth} canManage={canManage} overCeiling={overCeiling} marker={node.children.length ? (open ? "−" : "+") : "·"} onToggle={() => setOpen(!open)} />
      {open && node.children.length > 0 && (
        <ul className="space-y-2 pt-2">{node.children.map((c) => <Branch key={c.id} node={c} depth={depth + 1} canManage={canManage} overCeiling={overCeiling} />)}</ul>
      )}
    </li>
  );
}

function Row({ node, depth, marker = "·", onToggle, canManage, overCeiling }: { node: AccountNode; depth: number; marker?: string; onToggle?: () => void; canManage: boolean; overCeiling: ReadonlySet<number> }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("accounts").delete().eq("id", node.id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُذف الحساب"); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-card px-3 py-2" style={{ marginInlineStart: depth * 14 }}>
      <div className="flex items-center gap-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={onToggle}>
          <span className="w-4 shrink-0 text-center text-muted-foreground">{marker}</span>
          <span className="ledger-figures shrink-0 text-sm text-primary">{node.account_number}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{node.account_name}</span>
          {overCeiling.has(node.id) && (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">تجاوز السقف</span>
          )}
          <span className="shrink-0 text-[11px] text-muted-foreground">{node.group_name || node.account_type}</span>
        </button>
      </div>
      {canManage && (
        <div className="mt-2 flex justify-end">
          <RowActions canEdit canDelete pending={del.isPending} onEdit={() => setEditing((v) => !v)} onDelete={() => del.mutate()} />
        </div>
      )}
      {editing && <EditAccountForm node={node} onDone={() => setEditing(false)} />}
    </div>
  );
}

function EditAccountForm({ node, onDone }: { node: AccountNode; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: groups = [] } = useAccountGroups();
  const { data: currencies = [] } = useCurrencies();
  const [f, setF] = useState({
    name: node.account_name,
    type: node.account_type,
    group: node.group_id ? String(node.group_id) : "",
    ceiling: node.ceiling_amount != null ? String(node.ceiling_amount) : "",
    ceilingCurrency: node.ceiling_currency_id ? String(node.ceiling_currency_id) : "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .update({
          account_name: f.name.trim(),
          account_type: f.type,
          group_id: f.group ? Number(f.group) : null,
          ceiling_amount: f.ceiling ? Number(f.ceiling) : null,
          ceiling_currency_id: f.ceiling && f.ceilingCurrency ? Number(f.ceilingCurrency) : null,
        })
        .eq("id", node.id)
        .select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُفظ التعديل"); qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["statement-directory"] }); onDone(); },
    onError: (e) => toast.error(editErrorMessage(e)),
  });
  return (
    <FormCard className="mt-2 mb-0" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم الحساب">
        <Input required placeholder="اسم الحساب" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="نوع الحساب">
        <select className={selectCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option>رئيسي</option><option>فرعي</option>
        </select>
      </Field>
      <Field label="مجموعة الحساب">
        <select className={selectCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
          <option value="">بدون مجموعة</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="سقف الحساب (اختياري)">
          <Input inputMode="decimal" placeholder="بلا سقف" value={f.ceiling} onChange={(e) => setF({ ...f, ceiling: e.target.value })} className="ledger-figures" />
        </Field>
        <Field label="عملة السقف">
          <select className={selectCls} value={f.ceilingCurrency} onChange={(e) => setF({ ...f, ceilingCurrency: e.target.value })}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>حفظ التعديل</Button>
        <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>
      </div>
    </FormCard>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const { data: groups = [] } = useAccountGroups();
  const { data: currencies = [] } = useCurrencies();
  const [f, setF] = useState({ number: "", father: "", name: "", type: "فرعي", group: "", ceiling: "", ceilingCurrency: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").insert({
        account_number: Number(f.number),
        father_number: f.father ? Number(f.father) : null,
        account_name: f.name.trim(),
        account_type: f.type,
        group_id: f.group ? Number(f.group) : null,
        ceiling_amount: f.ceiling ? Number(f.ceiling) : null,
        ceiling_currency_id: f.ceiling && f.ceilingCurrency ? Number(f.ceilingCurrency) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("أُضيف الحساب"); onDone(); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "رقم الحساب مستخدم" : "لا تملك صلاحية إضافة الحسابات أو البيانات ناقصة"),
  });
  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم الحساب">
          <Input inputMode="numeric" placeholder="تلقائي حسب الأب" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
        <Field label="رقم الحساب الأب">
          <Input inputMode="numeric" placeholder="اختياري" value={f.father} onChange={(e) => setF({ ...f, father: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
      </div>
      <Field label="اسم الحساب">
        <Input required placeholder="مثال: الصندوق الرئيسي" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="نوع الحساب">
        <select className={selectCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option>رئيسي</option><option>فرعي</option>
        </select>
      </Field>
      <Field label="مجموعة الحساب">
        <select className={selectCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
          <option value="">بدون مجموعة</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="سقف الحساب (اختياري)">
          <Input inputMode="decimal" placeholder="بلا سقف" value={f.ceiling} onChange={(e) => setF({ ...f, ceiling: e.target.value })} className="ledger-figures" />
        </Field>
        <Field label="عملة السقف">
          <select className={selectCls} value={f.ceilingCurrency} onChange={(e) => setF({ ...f, ceilingCurrency: e.target.value })}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <Button type="submit" disabled={m.isPending}>حفظ</Button>
    </FormCard>
  );
}

/** العملات لاختيار عملة سقف الحساب. */
function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** مجموعات الحسابات (من شاشة التهيئة) للاختيار في نماذج الحساب. */
function useAccountGroups() {
  return useQuery({
    queryKey: ["account_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_groups").select("id, group_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}
