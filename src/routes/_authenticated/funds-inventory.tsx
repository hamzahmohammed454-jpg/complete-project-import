import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ClipboardCheck, Pencil, Trash2, Undo2, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";

import { BoxSelect } from "@/components/box-select";
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
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage } from "@/lib/crud-errors";
import { fmtMoney } from "@/lib/money";
import { collectPages } from "@/lib/paginated-read";
import { inventoryActions, inventoryAdjustment } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/funds-inventory")({
  head: () => ({
    meta: [
      { title: "جرد الصناديق — ابو طه للصرافة" },
      { name: "description", content: "مقارنة رصيد كل عملة في النظام بالعد الفعلي في الصندوق وتسجيل الفرق." },
      { property: "og:title", content: "جرد الصناديق — ابو طه للصرافة" },
      { property: "og:description", content: "محاضر جرد الصناديق بالعملات والفروقات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundsInventoryScreen,
});

type Inventory = {
  id: number;
  the_number: number | null;
  the_date: string;
  notes: string | null;
  box_id: number;
  voided_at: string | null;
  inventory_postings: { id: number; entry_id: number; reversal_entry_id: number | null }[];
  boxes: { box_name: string } | null;
  funds_inventory_details: {
    id: number;
    currency_id: number;
    system_amount: number | string;
    real_amount: number | string;
    difference: number | string;
    currencies: { currency_name: string } | null;
  }[];
};

function FundsInventoryScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/funds-inventory");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Inventory | null>(null);
  const [date, setDate] = useState(adenDate());
  const entryPermissions = useScreenPermissions("/entries");
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["funds_inventory", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funds_inventory")
        .select("id, the_number, the_date, box_id, voided_at, notes, inventory_postings(id, entry_id, reversal_entry_id), boxes(box_name), funds_inventory_details(id, currency_id, system_amount, real_amount, difference, currencies(currency_name))")
        .eq("the_date", date)
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Inventory[];
    },
  });
  const refresh = () => { void qc.invalidateQueries(); };
  const posting = useMutation({
    mutationFn: async ({ id, reverse }: { id: number; reverse: boolean }) => {
      if (!navigator.onLine) throw new Error("الترحيل يحتاج اتصالاً بالإنترنت");
      const { error } = await supabase.rpc(reverse ? "reverse_inventory_difference" : "post_inventory_difference", { p_id: id });
      if (error) throw error;
    },
    onSuccess: (_, args) => { toast.success(args.reverse ? "أُلغي الترحيل بقيد عكسي" : "رُحّل فارق الجرد"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("delete_funds_inventory", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُذف محضر الجرد");
      setSel(null);
      refresh();
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((i) => (i.boxes?.box_name ?? "").includes(term) || String(i.the_number ?? "").includes(term) || i.the_date.includes(term))
    : data;

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="جرد الصناديق" subtitle="محاضر الجرد وفروق الصندوق" />
      <DocumentToolbar
        selected={sel != null}
        canCreate={permissions.can("create")}
        canDelete={permissions.can("delete")}
        adding={open}
        onAdd={() => { setEditing(null); setOpen((v) => !v); }}
        onEdit={() => { const inv = data.find((r) => r.id === sel); if (!inv || inv.voided_at || inv.inventory_postings.some((p) => p.reversal_entry_id == null)) { toast.info("ألغ الترحيل قبل تعديل المحضر"); return; } if (permissions.can("update")) { setEditing(inv); setOpen(true); } }}
        onDelete={() => { if (sel != null) del.mutate(sel); }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث برقم المحضر أو الصندوق أو التاريخ" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Field label="تاريخ العرض"><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSel(null); }} className="ledger-figures mb-3" /></Field>
      {open && <InventoryForm key={editing?.id ?? "new"} inventory={editing} onDone={() => { setOpen(false); setEditing(null); }} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={data.length === 0 ? "لا توجد محاضر جرد بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "ابدأ أول جرد باختيار الصندوق وعدّ النقدية." : "جرّب بحثًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((inv) => {
            const hasDiff = inv.funds_inventory_details.some((d) => Number(d.difference) !== 0);
            const active = inv.inventory_postings.some((p) => p.reversal_entry_id == null);
            const actions = inventoryActions(active, inv.voided_at != null, hasDiff);
            return (
              <ListItem key={inv.id} className={sel === inv.id ? selectedRowCls : ""}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={sel === inv.id}
                  onClick={() => setSel(sel === inv.id ? null : inv.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold">
                      <span className="ledger-figures text-primary">محضر {inv.the_number ?? inv.id}</span> · {inv.boxes?.box_name ?? "—"}
                    </p>
                    <StatusPill tone={inv.voided_at ? "neutral" : active ? "ok" : hasDiff ? "warn" : "ok"}>{inv.voided_at ? "ملغي" : active ? "مرحّل" : hasDiff ? "فيه فرق" : "مطابق"}</StatusPill>
                  </div>
                  <p className="ledger-figures mt-1 text-xs text-muted-foreground">{inv.the_date}</p>
                  <ul className="mt-2 space-y-1">
                    {inv.funds_inventory_details.map((d) => (
                      <li key={d.id} className="ledger-figures flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{d.currencies?.currency_name ?? "—"}</span>
                        <span>
                          نظام {fmtMoney(d.system_amount, "")} · عدّ {fmtMoney(d.real_amount, "")}
                          {Number(d.difference) !== 0 && (
                            <span className={Number(d.difference) > 0 ? " text-positive" : " text-destructive"}>
                              {" "}فرق {fmtMoney(d.difference, "")}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {inv.notes && <p className="mt-1 text-[11px] text-muted-foreground">{inv.notes}</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                  {actions.post && permissions.can("update") && entryPermissions.can("create") && <Button size="sm" disabled={posting.isPending} onClick={async () => { if (await confirmAsk("ترحيل فارق الجرد إلى الحساب المحدد وتعديل رصيد الصندوق؟")) posting.mutate({ id: inv.id, reverse: false }); }}><ArrowUpFromLine className="size-4" />ترحيل فارق الجرد</Button>}
                  {actions.reverse && isManager && permissions.can("update") && entryPermissions.can("create") && <Button size="sm" variant="outline" disabled={posting.isPending} onClick={async () => { if (await confirmAsk("إلغاء ترحيل فارق الجرد بقيد عكسي وإعادة رصيد الصندوق؟")) posting.mutate({ id: inv.id, reverse: true }); }}><Undo2 className="size-4" />إلغاء الترحيل</Button>}
                  {actions.edit && permissions.can("update") && <Button size="sm" variant="outline" onClick={() => { setEditing(inv); setOpen(true); }}><Pencil className="size-4" />تعديل</Button>}
                  {actions.remove && isManager && permissions.can("delete") && <Button size="sm" variant="outline" disabled={del.isPending} onClick={async () => { if (await confirmAsk(`حذف المحضر ${inv.the_number ?? inv.id}؟ يُحفظ أثر أي ترحيل سابق.`)) del.mutate(inv.id); }}><Trash2 className="size-4" />حذف</Button>}
                </div>
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function InventoryForm({ onDone, inventory }: { onDone: () => void; inventory: Inventory | null }) {
  const qc = useQueryClient();
  const [boxId, setBoxId] = useState(inventory ? String(inventory.box_id) : "");
  const [notes, setNotes] = useState(inventory?.notes ?? "");
  const [date, setDate] = useState(inventory?.the_date ?? adenDate());
  const [real, setReal] = useState<Record<number, string>>(Object.fromEntries((inventory?.funds_inventory_details ?? []).map((d) => [d.currency_id, String(d.real_amount)])));
  const [extraCurrency, setExtraCurrency] = useState("");
  const { data: currencies = [] } = useQuery({ queryKey: ["inventory-currencies"], queryFn: async () => { const { data, error } = await supabase.from("currencies").select("id,currency_name").order("id"); if (error) throw error; return data; } });

  const { data: systemRows = [], isLoading } = useQuery({
    queryKey: ["inventory_system_balance", boxId],
    enabled: !!boxId,
    queryFn: async () => {
      const data = await collectPages(async (from, until) => {
        const { data, error } = await supabase.from("box_movements").select("currency_id, amount, movement_type, currencies(currency_name)").eq("box_id", Number(boxId)).order("id").range(from, until);
        if (error) throw error; return data;
      });
      const byCurrency = new Map<number, { name: string; total: number }>();
      for (const m of data) {
        if (m.currency_id == null) continue;
        const cur = byCurrency.get(m.currency_id) ?? { name: (m.currencies as { currency_name: string } | null)?.currency_name ?? "", total: 0 };
        cur.total += m.movement_type === "قبض" ? Number(m.amount) : -Number(m.amount);
        byCurrency.set(m.currency_id, cur);
      }
      return [...byCurrency.entries()].map(([id, v]) => ({ currency_id: id, currency_name: v.name, system: v.total }));
    },
  });

  const lines = useMemo(() => {
    const rows = new Map(systemRows.map((r) => [r.currency_id, r]));
    for (const key of Object.keys(real)) { const id = Number(key); if (!rows.has(id)) rows.set(id, { currency_id: id, currency_name: currencies.find((c) => c.id === id)?.currency_name ?? "—", system: 0 }); }
    return [...rows.values()].filter((r) => r.system !== 0 || real[r.currency_id] !== undefined);
  }, [systemRows, real, currencies]);

  const m = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error("حفظ الجرد يحتاج اتصالاً بالإنترنت");
      const details = lines.map((l) => { const counted = real[l.currency_id]; if (counted == null || counted.trim() === "") throw new Error("أدخل المعدود فعلياً لكل عملة"); inventoryAdjustment({ currency_id: l.currency_id, system_amount: l.system, real_amount: Number(counted) }); return { currency_id: l.currency_id, real_amount: Number(counted) }; });
      const { error } = await supabase.rpc("save_funds_inventory", { p_id: inventory?.id ?? 0, p_box: Number(boxId), p_date: date, p_notes: notes, p_lines: details });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظ محضر الجرد");
      void qc.invalidateQueries();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="تاريخ الجرد"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="الصندوق">
        <BoxSelect value={boxId} onChange={(id) => { setBoxId(id); setReal({}); }} />
      </Field>
      <Field label="إضافة عملة للجرد"><div className="flex gap-2"><select className={selectCls} value={extraCurrency} onChange={(e) => setExtraCurrency(e.target.value)}><option value="">اختر العملة</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}</select><Button variant="outline" type="button" disabled={!boxId || !extraCurrency} onClick={() => { setReal((r) => ({ ...r, [Number(extraCurrency)]: r[Number(extraCurrency)] ?? "" })); setExtraCurrency(""); }}>إضافة</Button></div></Field>
      {boxId && (
        isLoading ? (
          <LoadingRows rows={2} />
        ) : lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد أرصدة مسجلة لهذا الصندوق.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span>العملة</span>
              <span>رصيد النظام</span>
              <span>المعدود فعليًا</span>
            </div>
            {lines.map((l) => (
              <div key={l.currency_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <span className="text-sm">{l.currency_name}</span>
                <span className="ledger-figures text-sm">{fmtMoney(l.system, "")}</span>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={real[l.currency_id] ?? ""}
                  onChange={(e) => setReal({ ...real, [l.currency_id]: e.target.value })}
                  className="ledger-figures h-9 w-28"
                />
              </div>
            ))}
          </div>
        )
      )}
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2"><Button type="submit" disabled={m.isPending || !boxId || lines.length === 0}>{inventory ? "حفظ التعديل" : "حفظ محضر الجرد"}</Button><Button type="button" variant="outline" onClick={onDone}>إلغاء</Button></div>
    </FormCard>
  );
}
