import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

import { LiveAmountWords } from "@/components/amount-words";
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
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { fmt, fmtMoney } from "@/lib/money";
import { documentNumber } from "@/lib/document-number";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "سند قيد بسيط — ابو طه للصرافة" },
      { name: "description", content: "سند قيد بسيط بين حسابين: طرف مدين وطرف دائن، ينشئ قيدًا متوازنًا تلقائيًا." },
      { property: "og:title", content: "سند قيد بسيط — ابو طه للصرافة" },
      { property: "og:description", content: "سند قيد بسيط بين حسابين مع رقم مستقل وقيد متوازن." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JournalScreen,
});

type JournalVoucher = {
  document_number: number | null;
  id: number;
  the_number: number | null;
  the_date: string;
  amount: number | string;
  notes: string | null;
  debit_account: { account_number: number; account_name: string } | null;
  credit_account: { account_number: number; account_name: string } | null;
  currencies: { currency_name: string } | null;
};

function JournalScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["journal_vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_vouchers")
        .select("id, document_number, the_number, the_date, amount, notes, debit_account:accounts!debit_account_id(account_number, account_name), credit_account:accounts!credit_account_id(account_number, account_name), currencies!currency_id(currency_name)")
        .order("id", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as JournalVoucher[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("journal_vouchers").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف السند والقيد المرتبط به");
      qc.invalidateQueries({ queryKey: ["journal_vouchers"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((v) =>
        (v.debit_account?.account_name ?? "").includes(term) ||
        (v.credit_account?.account_name ?? "").includes(term) ||
        (v.notes ?? "").includes(term) ||
        `${documentNumber("journal", v.document_number)} ${v.the_number ?? ""}`.includes(term),
      )
    : data;

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="سند قيد بسيط" subtitle="سند بين حسابين: طرف مدين وطرف دائن — يُنشئ قيدًا متوازنًا تلقائيًا يظهر في القيود والتقارير وكشوف الحسابات." />
      <DocumentToolbar
        selected={sel != null}
        canCreate={true}
        canDelete={isManager}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (sel != null) { del.mutate(sel); setSel(null); } }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
        onPrintVoucher={() => sel != null && navigate({ to: "/voucher/$kind/$id", params: { kind: "journal", id: String(sel) } })}
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث بالحساب أو الرقم أو البيان" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <JournalForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={data.length === 0 ? "لا توجد سندات قيد بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "سجّل أول سند قيد بين حسابين ليُنشأ القيد تلقائيًا." : "جرّب البحث بحساب أو رقم أو بيان آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((v) => (
            <ListItem key={v.id} className={sel === v.id ? selectedRowCls : ""}>
              <div role="button" tabIndex={0} aria-pressed={sel === v.id} onClick={() => setSel(sel === v.id ? null : v.id)} className="cursor-pointer">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="ledger-figures min-w-0 truncate text-sm font-semibold text-primary">{documentNumber("journal", v.document_number)}</p>
                <span className="ledger-figures shrink-0 text-[11px] text-muted-foreground">{v.the_date}</span>
              </div>
              <p className="mt-1 truncate text-sm">
                مدين: {v.debit_account ? `${v.debit_account.account_number} — ${v.debit_account.account_name}` : "—"}
              </p>
              <p className="truncate text-sm">دائن: {v.credit_account ? `${v.credit_account.account_number} — ${v.credit_account.account_name}` : "—"}</p>
              <p className="ledger-figures mt-1 text-xs font-medium text-foreground">
                {fmtMoney(v.amount, v.currencies?.currency_name)}
              </p>
              {v.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{v.notes}</p>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Link
                  to="/voucher/$kind/$id"
                  params={{ kind: "journal", id: String(v.id) }}
                  className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                >
                  سند
                </Link>
                {isManager && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async () => { if (await confirmAsk(`حذف سند القيد رقم ${v.the_number ?? v.id}؟ يُحذف القيد المرتبط به معه.`)) del.mutate(v.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function JournalForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ debit_account_id: "", credit_account_id: "", amount: "", currency_id: "", the_date: adenDate(), notes: "" });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, account_number, account_name").order("account_number");
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

  const sameAccount = f.debit_account_id !== "" && f.debit_account_id === f.credit_account_id;

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("journal_vouchers").insert({
        debit_account_id: Number(f.debit_account_id),
        credit_account_id: Number(f.credit_account_id),
        amount: Number(f.amount),
        currency_id: Number(f.currency_id),
        the_date: f.the_date,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظ السند وأُنشئ القيد المتوازن");
      qc.invalidateQueries({ queryKey: ["journal_vouchers"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error && e.message.includes("journal_vouchers_accounts_chk") ? "لا يمكن أن يكون الحسابان هما نفسه" : "تعذّر الحفظ — تأكد من البيانات"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="الحساب المدين ( عليه )">
        <select required className={selectCls} value={f.debit_account_id} onChange={set("debit_account_id")}>
          <option value="">اختر الحساب</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_number} — {a.account_name}</option>)}
        </select>
      </Field>
      <Field label="الحساب الدائن ( له )">
        <select required className={selectCls} value={f.credit_account_id} onChange={set("credit_account_id")}>
          <option value="">اختر الحساب</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_number} — {a.account_name}</option>)}
        </select>
      </Field>
      {sameAccount && <Notice tone="danger">لا يمكن أن يكون الحسابان هما نفسه.</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input required inputMode="decimal" placeholder="0" value={f.amount} onChange={set("amount")} className="ledger-figures" />
        </Field>
        <Field label="العملة">
          <select required className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <LiveAmountWords amount={f.amount} currencyName={currencies.find((c) => c.id === Number(f.currency_id))?.currency_name ?? ""} />
      <Field label="التاريخ">
        <Input required type="date" value={f.the_date} onChange={set("the_date")} className="ledger-figures" />
      </Field>
      <Field label="البيان">
        <Input placeholder="وصف العملية" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || sameAccount}>حفظ سند القيد</Button>
    </FormCard>
  );
}
