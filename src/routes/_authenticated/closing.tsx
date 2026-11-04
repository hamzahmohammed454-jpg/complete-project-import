import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { useBoxes } from "@/components/box-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, ListItem, LoadingRows, SectionCard, StatusPill } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate, toSummaryMap, type DaySummary } from "@/lib/closing";
import { fmt } from "@/lib/money";
import { confirmOperation } from "@/lib/operation-confirmation";

export const Route = createFileRoute("/_authenticated/closing")({
  head: () => ({ meta: [{ title: "الإقفال اليومي ومطابقة الصناديق — ابو طه للصرافة" }, { name: "description", content: "مطابقة النقدية الفعلية مع رصيد الصندوق وإقفال حركات اليوم." }, { property: "og:title", content: "الإقفال اليومي ومطابقة الصناديق — ابو طه للصرافة" }, { property: "og:description", content: "مطابقة النقدية الفعلية مع رصيد الصندوق وإقفال حركات اليوم." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClosingScreen,
});

function ClosingScreen() {
  const today = adenDate();
  const [date, setDate] = useState(today);
  const { data: boxes = [], isLoading } = useBoxes();
  const { canCloseBoxes, isManager } = useAppRoles();
  const permissions = useScreenPermissions("/closing");

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const { data: summaryRows = [] } = useQuery({
    queryKey: ["box_day_summary", date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("box_day_summary", { p_date: date });
      if (error) throw error;
      return data;
    },
  });
  const { data: closings = [] } = useQuery({
    queryKey: ["box_closings", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("box_closings")
        .select("id, box_id, currency_id, system_balance, counted_amount, difference, notes")
        .eq("close_date", date);
      if (error) throw error;
      return data;
    },
  });

  const summaries = useMemo(() => toSummaryMap(summaryRows), [summaryRows]);

  const totals = useMemo(() => {
    const t = new Map<number, number>();
    for (const [key, s] of summaries) {
      const cur = Number(key.split("|")[1]);
      t.set(cur, (t.get(cur) ?? 0) + s.closing);
    }
    return t;
  }, [summaries]);

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="الإقفال اليومي" subtitle="طابق نقدية كل صندوق بالعدّ الفعلي، ثم أقفل اليوم فلا تُسجَّل عليه حركة بعدها." />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label="يوم الإقفال">
          <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} className="ledger-figures" />
        </Field>
      </div>

      {totals.size > 0 && (
        <SectionCard title="إجمالي النقدية في كل الصناديق">
          <ul className="space-y-1">
            {[...totals].map(([cur, v]) => (
              <li key={cur} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{currencies.find((c) => c.id === cur)?.currency_name ?? "—"}</span>
                <span className="ledger-figures shrink-0 font-semibold text-primary">{fmt(v)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : boxes.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="لا توجد صناديق بعد"
          hint="أضف صندوقًا من شاشة الصناديق ثم عُد للإقفال."
        />
      ) : (
        <ul className="space-y-3">
          {boxes.map((b) => {
            const rows = currencies
              .map((c) => ({ c, s: summaries.get(`${b.id}|${c.id}`) }))
              .filter((r): r is { c: (typeof currencies)[number]; s: DaySummary } => Boolean(r.s));
            return (
              <ListItem key={b.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">{b.box_name}</p>
                  <span className="ledger-figures shrink-0 text-xs text-muted-foreground">{b.the_number}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">لا حركات حتى هذا اليوم.</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {rows.map(({ c, s }) => (
                      <CurrencyClose
                        key={c.id}
                        boxId={b.id}
                        currencyId={c.id}
                        currencyName={c.currency_name}
                        date={date}
                        summary={s}
                        closing={closings.find((x) => x.box_id === b.id && x.currency_id === c.id)}
                        canClose={canCloseBoxes && permissions.can("close")}
                        canReopen={isManager && permissions.can("reopen")}
                      />
                    ))}
                  </div>
                )}
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function CurrencyClose({
  boxId, currencyId, currencyName, date, summary, closing, canClose, canReopen,
}: {
  boxId: number;
  currencyId: number;
  currencyName: string;
  date: string;
  summary: DaySummary;
  closing: { id: number; system_balance: number; counted_amount: number; difference: number | null; notes: string | null } | undefined;
  canClose: boolean;
  canReopen: boolean;
}) {
  const qc = useQueryClient();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const diff = counted === "" ? null : Number(counted) - summary.closing;

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("box_closings").insert({
        box_id: boxId, currency_id: currencyId, close_date: date, counted_amount: Number(counted), notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`أُقفل ${currencyName} لهذا اليوم`); qc.invalidateQueries({ queryKey: ["box_closings"] }); },
    onError: () => toast.error("تعذّر الإقفال — ربما أُقفل من قبل أو لا تملك الصلاحية"),
  });
  const reopen = useMutation({
    mutationFn: async () => {
      if (!closing) return;
      const { error } = await supabase.from("box_closings").delete().eq("id", closing.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("أُعيد فتح الصندوق"); qc.invalidateQueries({ queryKey: ["box_closings"] }); },
    onError: () => toast.error("إعادة الفتح للمدير فقط"),
  });

  return (
    <div className="rounded-xl border border-border/60 bg-paper shadow-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{currencyName}</span>
        {closing ? (
          <StatusPill tone="ok" className="inline-flex items-center gap-1">
            <Lock className="size-3" /> مقفل
          </StatusPill>
        ) : (
          <StatusPill tone="warn">مفتوح</StatusPill>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">الرصيد الافتتاحي</dt>
        <dd className="ledger-figures text-left">{fmt(summary.opening)}</dd>
        <dt className="text-muted-foreground">قبض اليوم</dt>
        <dd className="ledger-figures text-left text-positive">{fmt(summary.receipts)}</dd>
        <dt className="text-muted-foreground">صرف اليوم</dt>
        <dd className="ledger-figures text-left text-negative">{fmt(summary.payments)}</dd>
        <dt className="font-semibold">رصيد النظام</dt>
        <dd className="ledger-figures text-left font-semibold text-primary">{fmt(summary.closing)}</dd>
      </dl>

      {closing ? (
        <div className="mt-3 border-t border-border pt-2 text-xs">
          <div className="flex justify-between gap-2"><span className="text-muted-foreground">المعدود فعليًا</span><span className="ledger-figures">{fmt(Number(closing.counted_amount))}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">الفرق</span>
            <DiffValue diff={Number(closing.difference ?? 0)} />
          </div>
          {closing.notes && <p className="mt-1 text-muted-foreground">{closing.notes}</p>}
          {canReopen && (
            <Button size="sm" variant="outline" className="mt-2 w-full" disabled={reopen.isPending} onClick={() => confirmOperation(`إعادة فتح الصندوق لعملة ${currencyName}`, () => reopen.mutate())}>
              <LockOpen className="size-3.5" /> إعادة فتح
            </Button>
          )}
        </div>
      ) : canClose ? (
        <form className="mt-3 grid gap-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); confirmOperation(`إقفال الصندوق لعملة ${currencyName}`, () => close.mutate()); }}>
          <Field label="المبلغ المعدود فعليًا">
            <Input required inputMode="decimal" placeholder="0" value={counted} onChange={(e) => setCounted(e.target.value)} className="ledger-figures" />
          </Field>
          {diff != null && Number.isFinite(diff) && (
            <p className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">الفرق</span><DiffValue diff={diff} /></p>
          )}
          <Field label="ملاحظة">
            <Input placeholder="سبب الفرق إن وُجد" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={close.isPending || counted === ""}>
            <Lock className="size-3.5" /> إقفال {currencyName}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function DiffValue({ diff }: { diff: number }) {
  if (diff === 0) return <span className="font-medium text-primary">مطابق</span>;
  return (
    <span className={"ledger-figures font-semibold " + (diff > 0 ? "text-positive" : "text-negative")}>
      {diff > 0 ? "زيادة " : "عجز "}
      {fmt(Math.abs(diff))}
    </span>
  );
}
