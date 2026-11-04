import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
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
  selectCls,
} from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { isEntryBalanced } from "@/lib/entry-validation";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { documentNumber } from "@/lib/document-number";

export const Route = createFileRoute("/_authenticated/entries")({
  head: () => ({ meta: [{ title: "القيود اليومية — ابو طه للصرافة" }, { name: "description", content: "تسجيل القيود المتوازنة ومراجعة الأطراف المدينة والدائنة وأرقام المستندات." }, { property: "og:title", content: "القيود اليومية — ابو طه للصرافة" }, { property: "og:description", content: "تسجيل القيود المتوازنة ومراجعة الأطراف المدينة والدائنة وأرقام المستندات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EntriesScreen,
});

type Line = { side: "مدين" | "دائن"; account_id: string; amount: string; currency_id: string; notes: string };

const emptyLine = (side: "مدين" | "دائن"): Line => ({ side, account_id: "", amount: "", currency_id: "", notes: "" });

function EntriesScreen() {
  const { roles } = useAppRoles();
  const canWriteEntries = roles.some((role) => ["admin", "manager", "accountant", "teller"].includes(role));
  const permissions = useScreenPermissions("/entries");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, document_number, entry_number, the_date, notes, entries_details(side, amount)")
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="القيود اليومية" subtitle="قيد متعدد الأطراف لا يُحفظ إلا متوازنًا: مجموع المدين يساوي مجموع الدائن." />
      {canWriteEntries && permissions.can("create") && <Button className="mb-4 w-full" onClick={() => setOpen((v) => !v)}>
        {open ? "إغلاق النموذج" : "قيد جديد"}
      </Button>}
      {open && canWriteEntries && permissions.can("create") && <EntryForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="لا توجد قيود بعد"
          hint="أضف أول قيد يومي ليظهر هنا ويُدرج في التقارير."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((e) => {
            const details = (e.entries_details as { side: string; amount: number }[]) ?? [];
            const debit = details.filter((d) => d.side === "مدين").reduce((s, d) => s + Number(d.amount), 0);
            return (
              <ListItem key={e.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <p className="ledger-figures min-w-0 truncate text-sm font-semibold text-primary">{documentNumber("entry", e.document_number)}</p>
                  <span className="ledger-figures shrink-0 text-[11px] text-muted-foreground">{e.the_date}</span>
                </div>
                {e.notes && <p className="mt-1 truncate text-sm">{e.notes}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {details.length} طرف · الإجمالي <span className="ledger-figures">{fmt(debit)}</span>
                </p>
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function EntryForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [head, setHead] = useState({ number: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [lines, setLines] = useState<Line[]>([emptyLine("مدين"), emptyLine("دائن")]);

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

  const totals = useMemo(() => {
    const sum = (side: string) => lines.filter((l) => l.side === side).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return { debit: sum("مدين"), credit: sum("دائن") };
  }, [lines]);
  const balanced = isEntryBalanced(lines);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_balanced_entry", {
        p_entry_number: Number(head.number),
        p_the_date: head.date,
        p_notes: head.notes.trim(),
        p_branch_id: null as unknown as number,
        p_details: lines.map((l) => ({
          side: l.side,
          amount: Number(l.amount),
          account_id: l.account_id,
          currency_id: l.currency_id,
          notes: l.notes.trim() || null,
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظ القيد متوازنًا");
      qc.invalidateQueries({ queryKey: ["entries"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message.includes("غير متوازن") ? "القيد غير متوازن — راجع المبالغ" : "تعذّر الحفظ — تأكد من البيانات وصلاحيتك"),
  });

  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم القيد">
          <Input inputMode="numeric" placeholder="تلقائي" value={head.number}
            onChange={(e) => setHead({ ...head, number: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
        <Field label="تاريخ القيد">
          <Input required type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} className="ledger-figures" />
        </Field>
      </div>
      <Field label="البيان">
        <Input placeholder="وصف القيد" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
      </Field>

      {lines.map((l, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-border/60 bg-card shadow-card p-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الطرف">
              <select className={selectCls} value={l.side}
                onChange={(e) => setLine(i, "side", e.target.value)}>
                <option>مدين</option>
                <option>دائن</option>
              </select>
            </Field>
            <Field label="المبلغ">
              <Input required inputMode="decimal" placeholder="0" value={l.amount}
                onChange={(e) => setLine(i, "amount", e.target.value)} className="ledger-figures" />
            </Field>
          </div>
          <Field label="الحساب">
            <select required className={selectCls} value={l.account_id}
              onChange={(e) => setLine(i, "account_id", e.target.value)}>
              <option value="">اختر الحساب</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_number} — {a.account_name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="العملة">
              <select required className={selectCls} value={l.currency_id}
                onChange={(e) => setLine(i, "currency_id", e.target.value)}>
                <option value="">العملة</option>
                {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
              </select>
            </Field>
            <Field label="ملاحظة">
              <Input placeholder="اختياري" value={l.notes} onChange={(e) => setLine(i, "notes", e.target.value)} />
            </Field>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setLines([...lines, emptyLine("مدين")])}>+ طرف مدين</Button>
        <Button type="button" variant="outline" onClick={() => setLines([...lines, emptyLine("دائن")])}>+ طرف دائن</Button>
      </div>

      <Notice tone={balanced ? "success" : "danger"}>
        <span className="ledger-figures flex w-full justify-between gap-2 font-semibold">
          <span>مدين {fmt(totals.debit)}</span>
          <span>=</span>
          <span>دائن {fmt(totals.credit)}</span>
        </span>
      </Notice>

      <Button type="submit" disabled={m.isPending || !balanced}>حفظ القيد</Button>
    </FormCard>
  );
}
