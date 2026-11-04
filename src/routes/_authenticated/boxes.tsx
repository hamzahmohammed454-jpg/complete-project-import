import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Wallet } from "lucide-react";
import { toast } from "sonner";

import { RowActions } from "@/components/row-actions";
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
  SectionCard,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { boxErrorMessage } from "@/components/box-select";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { fmt, fmtSigned } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/boxes")({
  head: () => ({ meta: [{ title: "الصناديق — ابو طه للصرافة" }, { name: "description", content: "أرصدة الصناديق وحركات النقدية بكل عملة ومراجعة حسابات الخزينة." }, { property: "og:title", content: "الصناديق — ابو طه للصرافة" }, { property: "og:description", content: "أرصدة الصناديق وحركات النقدية بكل عملة ومراجعة حسابات الخزينة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BoxesScreen,
});

function BoxesScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [openBox, setOpenBox] = useState(false);
  const [openMove, setOpenMove] = useState(false);

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ["boxes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boxes").select("id, the_number, box_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const today = adenDate();
  const { data: summary = [] } = useQuery({
    queryKey: ["box_day_summary", today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("box_day_summary", { p_date: today });
      if (error) throw error;
      return data;
    },
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["box_movements_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("box_movements")
        .select("id, box_id, amount, movement_type, notes, created_at, currencies(currency_name)")
        .order("id", { ascending: false })
        .limit(15);
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

  // رصيد كل صندوق بكل عملة: قبض − صرف (محسوب في القاعدة)
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of summary) map.set(`${r.box_id}|${r.currency_id ?? 0}`, Number(r.closing));
    return map;
  }, [summary]);
  const boxName = (id: number) => boxes.find((b) => b.id === id)?.box_name ?? "";
  const term = q.trim();
  const shown = term ? boxes.filter((b) => b.box_name.includes(term) || String(b.the_number).includes(term)) : boxes;

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("boxes").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُذف الصندوق"); qc.invalidateQueries({ queryKey: ["boxes"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="الصناديق" subtitle="رصيد كل صندوق بكل عملة. البيع والشراء والحوالات تُسجَّل في الصندوق تلقائيًا." />
      <Link to="/closing" className="mb-3 block rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm font-medium text-primary">
        الإقفال اليومي ومطابقة الصناديق
      </Link>
      <Toolbar search={<Input placeholder="بحث باسم الصندوق أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        {isManager ? (
          <Button variant="outline" onClick={() => { setOpenBox((v) => !v); setOpenMove(false); }}>
            {openBox ? "إغلاق" : "إضافة صندوق"}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => { setOpenMove((v) => !v); setOpenBox(false); }} disabled={boxes.length === 0}>
          {openMove ? "إغلاق" : "حركة قبض / صرف"}
        </Button>
      </div>
      {openBox && <BoxForm onDone={() => setOpenBox(false)} />}
      {openMove && <MovementForm boxes={boxes} currencies={currencies} onDone={() => setOpenMove(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : boxes.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="لا توجد صناديق بعد"
          hint="أضف صندوقًا لكل موظف أو فرع ليُسجَّل فيه القبض والصرف."
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="لا نتائج مطابقة للبحث" hint="جرّب البحث باسم صندوق أو رقم آخر." />
      ) : (
        <ul className="space-y-2">
          {shown.map((b) => {
            const rows = currencies
              .map((c) => ({ c, bal: balances.get(`${b.id}|${c.id}`) ?? 0 }))
              .filter((r) => r.bal !== 0);
            return (
              <ListItem key={b.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">{b.box_name}</p>
                  <span className="ledger-figures shrink-0 text-xs text-muted-foreground">{b.the_number}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">لا حركات بعد — الرصيد صفر</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {rows.map((r) => (
                      <li key={r.c.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">{r.c.currency_name}</span>
                        <span className={"ledger-figures shrink-0 font-semibold " + (r.bal < 0 ? "text-negative" : "text-primary")}>
                          <bdi dir="ltr">{fmt(r.bal)}</bdi>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isManager && (
                  <div className="mt-2">
                    <RowActions
                      canEdit
                      canDelete
                      pending={del.isPending}
                      onEdit={() => setEditing(editing === b.id ? null : b.id)}
                      onDelete={() => del.mutate(b.id)}
                    />
                  </div>
                )}
                {editing === b.id && <BoxForm initial={b} onDone={() => setEditing(null)} />}
              </ListItem>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <SectionCard title="آخر الحركات" className="mt-6">
          <ul className="divide-y divide-border">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.notes || m.movement_type}</p>
                  <p className="truncate text-muted-foreground">{boxName(m.box_id)}</p>
                </div>
                <span className={"ledger-figures shrink-0 font-semibold " + (m.movement_type === "صرف" ? "text-negative" : "text-positive")}>
                  <bdi dir="ltr">{fmtSigned(m.movement_type === "صرف" ? -Number(m.amount) : Number(m.amount))}</bdi> {(m.currencies as { currency_name: string } | null)?.currency_name ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
}

function BoxForm({ initial, onDone }: { initial?: { id: number; box_name: string }; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ number: "", name: initial?.box_name ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      if (initial) {
        const { data, error } = await supabase.from("boxes").update({ box_name: f.name.trim() }).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("boxes").insert({ the_number: Number(f.number), box_name: f.name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيف الصندوق");
      qc.invalidateQueries({ queryKey: ["boxes"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الحفظ — رقم الصندوق مستخدم أو لا تملك الصلاحية"),
  });
  return (
    <FormCard
      className={initial ? "mt-3 mb-0" : undefined}
      onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
    >
      {!initial && (
        <Field label="رقم الصندوق">
          <Input inputMode="numeric" placeholder="يُعيَّن تلقائيًا إذا تُرك فارغًا" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
      )}
      <Field label="اسم الصندوق">
        <Input required placeholder="مثل: صندوق أحمد — الفرع الرئيسي" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

function MovementForm({ boxes, currencies, onDone }: {
  boxes: { id: number; box_name: string }[];
  currencies: { id: number; currency_name: string }[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({ box_id: "", currency_id: "", amount: "", type: "قبض", notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("box_movements").insert({
        box_id: Number(f.box_id),
        currency_id: f.currency_id ? Number(f.currency_id) : null,
        amount: Number(f.amount),
        movement_type: f.type,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سُجّلت الحركة");
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      qc.invalidateQueries({ queryKey: ["box_movements_recent"] });
      onDone();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="الصندوق">
        <select required className={selectCls} value={f.box_id} onChange={set("box_id")}>
          <option value="">اختر الصندوق</option>
          {boxes.map((b) => <option key={b.id} value={b.id}>{b.box_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الحركة">
          <select className={selectCls} value={f.type} onChange={set("type")}>
            <option>قبض</option>
            <option>صرف</option>
          </select>
        </Field>
        <Field label="العملة">
          <select required className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="المبلغ">
        <Input required inputMode="decimal" placeholder="0" value={f.amount} onChange={set("amount")} className="ledger-figures" />
      </Field>
      <Field label="البيان / ملاحظات">
        <Input placeholder="سبب الحركة" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending}>حفظ الحركة</Button>
    </FormCard>
  );
}
