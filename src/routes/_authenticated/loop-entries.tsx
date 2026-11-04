import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Repeat2 } from "lucide-react";
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
  StatusPill,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { isEntryBalanced } from "@/lib/entry-validation";
import { fmtMoney } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/loop-entries")({
  head: () => ({
    meta: [
      { title: "القيود الدائرية — ابو طه للصرافة" },
      { name: "description", content: "قوالب قيود تتكرر (إيجارات، رواتب، مصاريف ثابتة) تُولَّد كقيد حقيقي بضغطة واحدة." },
      { property: "og:title", content: "القيود الدائرية — ابو طه للصرافة" },
      { property: "og:description", content: "تهيئة القيود الدائرية وتوليدها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoopEntriesScreen,
});

type LoopLine = {
  id: number;
  side: string;
  amount: number | string;
  account_id: number | null;
  currency_id: number | null;
  notes: string | null;
  accounts: { account_name: string } | null;
  currencies: { currency_name: string } | null;
};

type Loop = {
  id: number;
  the_number: number | null;
  title: string;
  notes: string | null;
  active: boolean;
  loop_entries_details: LoopLine[];
  loop_entries_runs: { id: number; run_date: string }[];
};

function LoopEntriesScreen() {
  const qc = useQueryClient();
  const permissions = useScreenPermissions("/loop-entries");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["loop_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loop_entries")
        .select("id, the_number, title, notes, active, loop_entries_details(id, side, amount, account_id, currency_id, notes, accounts(account_name), currencies(currency_name)), loop_entries_runs(id, run_date)")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as unknown as Loop[];
    },
  });

  const generate = useMutation({
    mutationFn: async (loop: Loop) => {
      const { data: maxRow } = await supabase.from("entries").select("entry_number").order("entry_number", { ascending: false }).limit(1).maybeSingle();
      const nextNumber = (maxRow?.entry_number ?? 0) + 1;
      const { data: entryId, error } = await supabase.rpc("create_balanced_entry", {
        p_entry_number: nextNumber,
        p_the_date: adenDate(),
        p_notes: `قيد دائري: ${loop.title}`,
        p_branch_id: null as unknown as number,
        p_details: loop.loop_entries_details.map((l) => ({
          side: l.side,
          amount: Number(l.amount),
          account_id: l.account_id,
          currency_id: l.currency_id,
          notes: l.notes,
        })),
      });
      if (error) throw error;
      const { error: runErr } = await supabase.from("loop_entries_runs").insert({ loop_id: loop.id, entry_id: entryId as number });
      if (runErr) throw runErr;
    },
    onSuccess: () => {
      toast.success("وُلّد القيد وسُجّل في سجل التنفيذ");
      qc.invalidateQueries({ queryKey: ["loop_entries"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("loop_entries").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف القيد الدائري");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["loop_entries"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term ? data.filter((l) => l.title.includes(term) || String(l.the_number ?? "").includes(term)) : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="القيود الدائرية" subtitle="قوالب للقيود المتكررة (إيجار، رواتب، مصاريف ثابتة): تُهيأ مرة واحدة وتُولَّد كقيد حقيقي بضغطة، مع سجل بكل توليد." />
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
      <Toolbar search={<Input ref={searchRef} placeholder="بحث باسم القيد أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <LoopForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title={data.length === 0 ? "لا توجد قيود دائرية بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "هيّئ أول قيد متكرر ببنوده المدينة والدائنة." : "جرّب بحثًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((loop) => (
            <ListItem key={loop.id} className={sel === loop.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === loop.id}
                onClick={() => setSel(sel === loop.id ? null : loop.id)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">
                    <span className="ledger-figures text-primary">{loop.the_number ?? loop.id}</span> · {loop.title}
                  </p>
                  <StatusPill tone={loop.active ? "ok" : "neutral"}>{loop.active ? "فعّال" : "موقوف"}</StatusPill>
                </div>
                <ul className="mt-2 space-y-1">
                  {loop.loop_entries_details.map((l) => (
                    <li key={l.id} className="ledger-figures flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{l.side} — {l.accounts?.account_name ?? "بدون حساب"}</span>
                      <span>{fmtMoney(l.amount, l.currencies?.currency_name)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  وُلّد {loop.loop_entries_runs.length} مرة
                  {loop.loop_entries_runs.length > 0 && ` — آخرها ${[...loop.loop_entries_runs].sort((a, b) => b.run_date.localeCompare(a.run_date))[0]?.run_date ?? ""}`}
                </p>
              </div>
              {permissions.can("create") && loop.active && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    disabled={generate.isPending || loop.loop_entries_details.length === 0}
                    onClick={async () => { if (await confirmAsk(`توليد قيد اليوم من «${loop.title}»؟`)) generate.mutate(loop); }}
                  >
                    توليد قيد اليوم
                  </Button>
                </div>
              )}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

type DraftLine = { side: string; amount: string; currency_id: string; account_id: string; notes: string };

function LoopForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { side: "مدين", amount: "", currency_id: "", account_id: "", notes: "" },
    { side: "دائن", amount: "", currency_id: "", account_id: "", notes: "" },
  ]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, account_name").order("the_number");
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

  const balanced = isEntryBalanced(lines);

  const m = useMutation({
    mutationFn: async () => {
      const { data: head, error: headErr } = await supabase
        .from("loop_entries")
        .insert({ title: title.trim(), notes: notes.trim() || null })
        .select("id")
        .single();
      if (headErr) throw headErr;
      const details = lines.map((l) => ({
        loop_id: head.id,
        side: l.side,
        amount: Number(l.amount),
        currency_id: Number(l.currency_id),
        account_id: l.account_id ? Number(l.account_id) : null,
        notes: l.notes.trim() || null,
      }));
      const { error: detErr } = await supabase.from("loop_entries_details").insert(details);
      if (detErr) throw detErr;
    },
    onSuccess: () => {
      toast.success("حُفظ القيد الدائري");
      qc.invalidateQueries({ queryKey: ["loop_entries"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const setLine = (i: number, k: keyof DraftLine, v: string) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم القيد الدائري">
        <Input required placeholder="مثال: إيجار المحل الشهري" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">البنود (يجب أن يتوازن المدين مع الدائن لكل عملة)</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-xl border border-border/60 p-2">
            <select className={selectCls} value={l.side} onChange={(e) => setLine(i, "side", e.target.value)}>
              <option value="مدين">مدين</option>
              <option value="دائن">دائن</option>
            </select>
            <Input required inputMode="decimal" placeholder="المبلغ" value={l.amount} onChange={(e) => setLine(i, "amount", e.target.value)} className="ledger-figures" />
            <select required className={selectCls} value={l.currency_id} onChange={(e) => setLine(i, "currency_id", e.target.value)}>
              <option value="">العملة</option>
              {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
            </select>
            <select required className={`${selectCls} col-span-2`} value={l.account_id} onChange={(e) => setLine(i, "account_id", e.target.value)}>
              <option value="">الحساب</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
              disabled={lines.length <= 2}
              className="text-[11px] font-medium text-destructive disabled:opacity-40"
            >
              حذف السطر
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines([...lines, { side: "مدين", amount: "", currency_id: "", account_id: "", notes: "" }])}
          className="text-xs font-medium text-primary"
        >
          + إضافة سطر
        </button>
      </div>
      {!balanced && <p className="text-[11px] font-medium text-destructive">القيد غير متوازن — راجع مبالغ المدين والدائن لكل عملة.</p>}
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" disabled={m.isPending || !title.trim() || !balanced || lines.some((l) => !l.amount || !l.currency_id)}>
        حفظ القيد الدائري
      </Button>
    </FormCard>
  );
}
