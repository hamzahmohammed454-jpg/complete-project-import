import { useSystemSettings } from "@/hooks/use-system-settings";
import { confirmAsk } from "@/components/confirm-dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BoxSelect, boxErrorMessage } from "@/components/box-select";
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
  Segments,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage } from "@/lib/crud-errors";
import { groupVoucherRows, multiVoucherLines, type VoucherAmountInput } from "@/lib/multi-voucher";
import { fmt, fmtMoney } from "@/lib/money";
import { documentNumber } from "@/lib/document-number";
import { KIND_OF, voucherScreenType, type VoucherType } from "@/lib/voucher-screen";

export const Route = createFileRoute("/_authenticated/vouchers")({
  head: ({ match }) => {
    const type = voucherScreenType(match.search.kind);
    const title = `${match.search.multi ? `سند ${type} متعدد العملات` : `سند ${type}`} — ابو طه للصرافة`;
    const description = `تسجيل وعرض سند ${type} مستقل وربطه بالصندوق وكشف حساب العميل.`;
    return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
    };
  },
  // أيقونات الأقسام تفتح نوع السند المطلوب مباشرة: /vouchers?kind=payment
  validateSearch: (s: Record<string, unknown>): { kind?: "receipt" | "payment" | "deposit"; multi?: boolean } => ({
    ...(s["kind"] === "receipt" || s["kind"] === "payment" || s["kind"] === "deposit" ? { kind: s["kind"] } : {}),
    ...(s["multi"] === true || s["multi"] === "true" ? { multi: true } : {}),
  }),
  component: VouchersScreen,
});

type Voucher = {
  batch_id: string | null;
  batch_position: number | null;
  document_number: number | null;
  id: number;
  the_number: number | null;
  voucher_type: string;
  amount: number | string;
  the_date: string;
  cash_name: string | null;
  notes: string | null;
  customer_id: number | null;
  customers: { full_name: string } | null;
  currencies: { currency_name: string } | null;
  boxes: { box_name: string } | null;
};

function VouchersScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const { kind, multi } = Route.useSearch();
  const type = voucherScreenType(kind);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["cash_vouchers", type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_vouchers")
        .select("id, batch_id, batch_position, document_number, the_number, voucher_type, amount, the_date, cash_name, notes, customer_id, customers(full_name), currencies!currency_id(currency_name), boxes(box_name)")
        .eq("voucher_type", type)
        .order("id", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = data as unknown as Voucher[];
      const batchIds = [...new Set(rows.map((row) => row.batch_id).filter((id): id is string => id != null))];
      if (batchIds.length) {
        const { data: complete, error: batchError } = await supabase.from("cash_vouchers")
          .select("id, batch_id, batch_position, document_number, the_number, voucher_type, amount, the_date, cash_name, notes, customer_id, customers(full_name), currencies!currency_id(currency_name), boxes(box_name)")
          .in("batch_id", batchIds).order("id", { ascending: false });
        if (batchError) throw batchError;
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const row of complete as unknown as Voucher[]) byId.set(row.id, row);
        return groupVoucherRows([...byId.values()]);
      }
      return groupVoucherRows(rows);
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("delete_cash_voucher", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُذف السند وحركته من الصندوق");
      qc.invalidateQueries({ queryKey: ["cash_vouchers"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
      qc.invalidateQueries({ queryKey: ["voucher"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((v) =>
        (v.customers?.full_name ?? "").includes(term) ||
        (v.cash_name ?? "").includes(term) ||
        (v.notes ?? "").includes(term) ||
        `${documentNumber(KIND_OF[type], v.document_number)} ${v.the_number ?? ""}`.includes(term),
      )
    : data;
  const visible = multi ? matches.filter((v) => v.batch_id != null) : matches;

  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro title={multi ? `سند ${type} متعدد العملات` : `سند ${type}`} subtitle="" />
      <DocumentToolbar
        selected={sel != null}
        canCreate
        canDelete={isManager}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (sel != null) { del.mutate(sel); setSel(null); } }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
        onPrintVoucher={() => sel != null && navigate({ to: "/voucher/$kind/$id", params: { kind: KIND_OF[type], id: String(sel) } })}
      />
      <Toolbar
        search={<Input ref={searchRef} placeholder="بحث بالاسم أو الرقم أو البيان" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {open && <VoucherForm key={`${type}-${multi}`} type={type} multiDefault={multi ?? false} onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={data.length === 0 ? `لا توجد سندات ${type} بعد` : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "سجّل أول سند ليُحرَّك الصندوق ويظهر في كشف حساب العميل." : "جرّب البحث باسم أو رقم أو بيان آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((v) => (
            <ListItem key={v.id} className={sel === v.id ? selectedRowCls : ""}>
              <div role="button" tabIndex={0} aria-pressed={sel === v.id} onClick={() => setSel(sel === v.id ? null : v.id)} className="cursor-pointer">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="ledger-figures min-w-0 truncate text-sm font-semibold text-primary">{documentNumber(KIND_OF[type], v.document_number)}</p>
                <span className="ledger-figures shrink-0 text-[11px] text-muted-foreground">{v.the_date}</span>
              </div>
              <p className="mt-1 truncate text-sm">{v.customers?.full_name ?? v.cash_name ?? "نقدي"}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="ledger-figures min-w-0 truncate font-medium text-foreground">
                  {v.amounts.map((line) => <span className="block" key={line.id}>{fmtMoney(line.amount, line.currencies?.currency_name)}</span>)}
                </span>
                <span className="min-w-0 shrink-0 truncate">{v.boxes?.box_name ?? ""}</span>
              </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/voucher/$kind/$id"
                    params={{ kind: KIND_OF[v.voucher_type as VoucherType] ?? "receipt", id: String(v.id) }}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                  >
                    سند
                  </Link>
                  {v.customer_id && (
                    <Link
                      to="/statement"
                      search={{ type: "customer", id: v.customer_id }}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                    >
                      كشف حساب
                    </Link>
                  )}
                </div>
                {isManager && (
                  <Button variant="ghost" size="sm"
                    type="button"
                    disabled={del.isPending}
                    onClick={async () => { if (await confirmAsk(`حذف سند ${v.voucher_type} رقم ${v.the_number ?? v.id}؟ تُحذف حركته من الصندوق معه.`)) del.mutate(v.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </Button>
                )}
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function VoucherForm({ type, multiDefault, onDone }: { type: VoucherType; multiDefault?: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const setting = useSystemSettings();
  const [f, setF] = useState({ customer_id: "", cash_name: "", amount: "", currency_id: "", box_id: "", the_date: adenDate(), notes: "", method: "cash", check_number: "", bank_name: "", due_date: "" });
  const [multiple, setMultiple] = useState(multiDefault ?? false);
  const [lines, setLines] = useState<VoucherAmountInput[]>([{ currency_id: "", amount: "" }, { currency_id: "", amount: "" }]);
  const batchRef = useRef<string | null>(null);
  // طريقة القبض/الصرف: نقد يحرّك الصندوق؛ شيك يُسجَّل في الشيكات تحت التحصيل ويدخل الصندوق وكشف العميل عند تحصيله فقط
  const canCheck = type !== "إيداع";
  const byCheck = canCheck && f.method === "check";
  const setBox = (v: string) => setF((p) => ({ ...p, box_id: v }));

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, the_user_id, full_name").order("full_name");
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
      if (multiple) {
        const values = multiVoucherLines(lines);
        if (!batchRef.current) batchRef.current = crypto.randomUUID();
        const { data, error } = await supabase.rpc("create_multi_cash_voucher", {
          p_batch: batchRef.current, p_type: type, p_customer: f.customer_id ? Number(f.customer_id) : 0,
          p_name: f.cash_name, p_box: Number(f.box_id), p_date: f.the_date, p_notes: f.notes, p_lines: values,
        });
        if (error) throw error;
        return;
      }
      if (byCheck) {
        const { error } = await supabase.from("checks").insert({
          check_type: type === "قبض" ? "وارد" : "صادر",
          check_number: f.check_number.trim(),
          bank_name: f.bank_name.trim() || null,
          customer_id: f.customer_id ? Number(f.customer_id) : null,
          party_name: f.customer_id ? null : f.cash_name.trim() || null,
          amount: Number(f.amount),
          currency_id: Number(f.currency_id),
          the_date: f.the_date,
          due_date: f.due_date || null,
          notes: f.notes.trim() || null,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("cash_vouchers").insert({
        voucher_type: type,
        customer_id: f.customer_id ? Number(f.customer_id) : null,
        cash_name: f.customer_id ? null : f.cash_name.trim() || null,
        amount: Number(f.amount),
        currency_id: Number(f.currency_id),
        box_id: f.box_id ? Number(f.box_id) : null,
        the_date: f.the_date,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(byCheck ? "سُجّل الشيك تحت التحصيل؛ يدخل الصندوق وكشف العميل عند تحصيله" : "حُفظ السند وتحرّك الصندوق");
      qc.invalidateQueries({ queryKey: ["checks"] });
      qc.invalidateQueries({ queryKey: ["cash_vouchers"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
      qc.invalidateQueries({ queryKey: ["voucher"] });
      onDone();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard confirm={false} onSubmit={async (e) => {
      e.preventDefault();
      if (m.isPending) return;
      if (setting("acc.req_notes") && !f.notes.trim()) { toast.error("أدخل البيان/الملاحظات (مطلوب في الإعدادات)"); return; }
      if (multiple) {
        try { multiVoucherLines(lines); } catch (error) { toast.error(boxErrorMessage(error)); return; }
      }
      const amounts = (multiple ? lines : [{ currency_id: f.currency_id, amount: f.amount }])
        .map((line) => fmtMoney(line.amount, currencies.find((currency) => currency.id === Number(line.currency_id))?.currency_name)).join("\n");
      const party = customers.find((customer) => customer.id === Number(f.customer_id))?.full_name ?? f.cash_name;
      const effect = byCheck ? "سيُسجّل الشيك تحت التحصيل دون حركة صندوق الآن." : "ستُسجّل حركة السند في الصندوق وكشف الحساب.";
      if (await confirmAsk(`تأكيد حفظ سند ${type}؟\n${party}\n${amounts}\n${effect}`)) m.mutate();
    }}>
      <Segments ariaLabel="عملات السند" value={multiple ? "multi" : "single"} options={[{ value: "single", label: "عملة واحدة" }, { value: "multi", label: "عدة عملات" }]} onChange={(value) => { setMultiple(value === "multi"); setF((p) => ({ ...p, method: "cash" })); }} />
      <Field label="العميل">
        <select className={selectCls} value={f.customer_id} onChange={set("customer_id")}>
          <option value="">{type === "صرف" ? "صرف لعميل مسجل (أو اكتب الاسم تحت)" : "عميل مسجل (أو اكتب الاسم تحت)"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.the_user_id ? `${c.the_user_id} — ` : ""}{c.full_name}</option>
          ))}
        </select>
      </Field>
      {!f.customer_id && (
        <Field label="الاسم">
          <Input placeholder="الاسم لغير المسجلين" value={f.cash_name} onChange={set("cash_name")} />
        </Field>
      )}
      {multiple ? <div className="space-y-3">
        {lines.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2">
          <Field label={`المبلغ ${index + 1}`}><Input aria-label={`المبلغ ${index + 1}`} required inputMode="decimal" className="ledger-figures" value={line.amount} onChange={(e) => setLines((previous) => previous.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} /></Field>
          <Field label={`العملة ${index + 1}`}><select aria-label={`العملة ${index + 1}`} required className={selectCls} value={line.currency_id} onChange={(e) => setLines((previous) => previous.map((item, i) => i === index ? { ...item, currency_id: e.target.value } : item))}><option value="">اختر العملة</option>{currencies.map((c) => <option key={c.id} value={c.id} disabled={lines.some((item, i) => i !== index && item.currency_id === String(c.id))}>{c.currency_name}</option>)}</select></Field>
          <Button type="button" size="icon" variant="ghost" title="حذف العملة" aria-label={`حذف العملة ${index + 1}`} disabled={lines.length <= 2} onClick={() => setLines((previous) => previous.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={lines.length >= currencies.length} onClick={() => setLines((previous) => [...previous, { currency_id: "", amount: "" }])}><Plus className="size-4" />إضافة عملة</Button>
      </div> : <><div className="grid grid-cols-2 gap-2">
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
      </>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="التاريخ">
          <Input required type="date" value={f.the_date} onChange={set("the_date")} className="ledger-figures" />
        </Field>
        {canCheck && (
          <Field label={type === "قبض" ? "طريقة القبض" : "طريقة الصرف"}>
            <select className={selectCls} value={f.method} onChange={set("method")}>
              <option value="cash">نقد</option>
              {!multiple && <option value="check">شيك</option>}
            </select>
          </Field>
        )}
      </div>
      {byCheck ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="رقم الشيك">
              <Input required value={f.check_number} onChange={set("check_number")} className="ledger-figures" />
            </Field>
            <Field label="البنك">
              <Input placeholder="اسم البنك" value={f.bank_name} onChange={set("bank_name")} />
            </Field>
          </div>
          <Field label="تاريخ الاستحقاق">
            <Input type="date" value={f.due_date} onChange={set("due_date")} className="ledger-figures" />
          </Field>
          <Notice tone="info">يُسجَّل الشيك {type === "قبض" ? "وارداً" : "صادراً"} تحت التحصيل في شاشة الشيكات، ولا يتحرك الصندوق ولا كشف العميل إلا عند تحصيله.</Notice>
        </>
      ) : (
        <Field label="الصندوق">
          <BoxSelect value={f.box_id} onChange={setBox} />
        </Field>
      )}
      <Field label="البيان">
        <Input placeholder="وصف العملية" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || (!f.customer_id && !f.cash_name.trim()) || (multiple && !f.box_id) || (byCheck && !f.check_number.trim())}>
        حفظ سند {type === "إيداع" ? "الإيداع" : type}
      </Button>
    </FormCard>
  );
}
