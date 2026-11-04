import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Field,
  FormCard,
  ListItem,
  LoadingRows,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/bank-accounts")({
  head: () => ({
    meta: [
      { title: "الحسابات البنكية — ابو طه للصرافة" },
      { name: "description", content: "حسابات المنشأة لدى البنوك: رقم الحساب واسمه ونوعه وعملته." },
      { property: "og:title", content: "الحسابات البنكية — ابو طه للصرافة" },
      { property: "og:description", content: "دليل الحسابات البنكية للمنشأة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankAccountsScreen,
});

type BankAccount = {
  id: number;
  account_number: string;
  account_name: string | null;
  account_type: string | null;
  notes: string | null;
  banks: { bank_name: string } | null;
  currencies: { currency_name: string } | null;
};

const ACCOUNT_TYPES = ["جاري", "توفير", "وديعة"] as const;

function BankAccountsScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/bank-accounts");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["bank_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_number, account_name, account_type, notes, banks(bank_name), currencies(currency_name)")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as unknown as BankAccount[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("bank_accounts").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف الحساب البنكي");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((a) =>
        (a.banks?.bank_name ?? "").includes(term) ||
        a.account_number.includes(term) ||
        (a.account_name ?? "").includes(term),
      )
    : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="الحسابات البنكية" subtitle="حسابات المنشأة لدى البنوك: تُسجّل برقمها واسمها ونوعها وعملتها وتظهر عند التعاملات البنكية." />
      <DocumentToolbar
        selected={sel != null}
        canCreate={permissions.can("create")}
        canDelete={permissions.can("delete")}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (sel != null) del.mutate(sel); }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث بالبنك أو رقم الحساب أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <AccountForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={data.length === 0 ? "لا توجد حسابات بنكية بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول حساب بنكي للمنشأة." : "جرّب بحثًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((a) => (
            <ListItem key={a.id} className={sel === a.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === a.id}
                onClick={() => setSel(sel === a.id ? null : a.id)}
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.banks?.bank_name ?? "—"} <span className="ledger-figures text-muted-foreground">— {a.account_number}</span></p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {a.account_name ?? "—"}{a.account_type ? ` · ${a.account_type}` : ""}{a.currencies?.currency_name ? ` · ${a.currencies.currency_name}` : ""}
                  </p>
                </div>
                {isManager && permissions.can("delete") && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async (e) => { e.stopPropagation(); if (await confirmAsk(`حذف الحساب ${a.account_number}؟`)) del.mutate(a.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
              {a.notes && <p className="mt-1 text-[11px] text-muted-foreground">{a.notes}</p>}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ bank_id: "", account_number: "", account_name: "", account_type: "", currency_id: "", notes: "" });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, bank_name").order("bank_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bank_accounts").insert({
        bank_id: Number(f.bank_id),
        account_number: f.account_number.trim(),
        account_name: f.account_name.trim() || null,
        account_type: f.account_type || null,
        currency_id: f.currency_id ? Number(f.currency_id) : null,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُضيف الحساب البنكي");
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="البنك">
          <select required className={selectCls} value={f.bank_id} onChange={set("bank_id")}>
            <option value="">اختر البنك</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
          </select>
        </Field>
        <Field label="رقم الحساب">
          <Input required value={f.account_number} onChange={set("account_number")} className="ledger-figures" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="اسم الحساب">
          <Input placeholder="اسم صاحب الحساب" value={f.account_name} onChange={set("account_name")} />
        </Field>
        <Field label="نوع الحساب">
          <select className={selectCls} value={f.account_type} onChange={set("account_type")}>
            <option value="">اختر النوع</option>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="العملة">
        <select className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
          <option value="">اختر العملة (اختياري)</option>
          {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
        </select>
      </Field>
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || !f.bank_id || !f.account_number.trim()}>حفظ الحساب</Button>
    </FormCard>
  );
}
