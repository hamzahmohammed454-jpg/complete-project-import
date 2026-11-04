import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

import { BoxSelect, boxErrorMessage } from "@/components/box-select";
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
  StatusPill,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { fmt, fmtMoney } from "@/lib/money";
import { documentNumber } from "@/lib/document-number";

export const Route = createFileRoute("/_authenticated/checks")({
  head: () => ({
    meta: [
      { title: "الشيكات — ابو طه للصرافة" },
      { name: "description", content: "شيكات واردة وصادرة: تسجيل، تحصيل في الصندوق، إرجاع، ومتابعة الاستحقاق." },
      { property: "og:title", content: "الشيكات — ابو طه للصرافة" },
      { property: "og:description", content: "متابعة الشيكات وتحصيلها وربطها بالحوالات دون تكرار حركة النقدية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChecksScreen,
});

type CheckType = "وارد" | "صادر";
const TYPES: readonly CheckType[] = ["وارد", "صادر"];

type Check = {
  document_number: number | null;
  id: number;
  the_number: number | null;
  check_type: string;
  check_number: string;
  bank_name: string | null;
  party_name: string | null;
  customer_id: number | null;
  amount: number | string;
  the_date: string;
  due_date: string | null;
  status: string;
  notes: string | null;
  customers: { full_name: string } | null;
  currencies: { currency_name: string } | null;
  boxes: { box_name: string } | null;
};

function statusTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "محصل") return "ok";
  if (status === "تحت التحصيل") return "warn";
  if (status === "مرتجع") return "bad";
  return "neutral";
}

function ChecksScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/checks");
  const [type, setType] = useState<CheckType>("وارد");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [collectId, setCollectId] = useState<number | null>(null);
  const [collectBox, setCollectBox] = useState("");
  const [statusFilter, setStatusFilter] = useState<"الكل" | "تحت التحصيل" | "مستحقة" | "محصل" | "مرتجع">("الكل");

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["checks", type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checks")
        .select("id, document_number, the_number, check_type, check_number, bank_name, party_name, customer_id, amount, the_date, due_date, status, notes, customers(full_name), currencies!currency_id(currency_name), boxes(box_name)")
        .eq("check_type", type)
        .order("id", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Check[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["checks"] });
    qc.invalidateQueries({ queryKey: ["box_day_summary"] });
    qc.invalidateQueries({ queryKey: ["statement"] });
  };

  const collect = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase
        .from("checks")
        .update({ status: "محصل", box_id: Number(collectBox), collected_date: adenDate() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُصّل الشيك وتحرّك الصندوق");
      setCollectId(null);
      setCollectBox("");
      invalidate();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const bounce = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("checks").update({ status: "مرتجع" }).eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("سُجّل الشيك مرتجعًا");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("checks").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف الشيك وحركته من الصندوق");
      invalidate();
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const today = adenDate();
  const byStatus =
    statusFilter === "الكل" ? data
    : statusFilter === "مستحقة" ? data.filter((c) => c.status === "تحت التحصيل" && c.due_date != null && c.due_date <= today)
    : data.filter((c) => c.status === statusFilter);
  const matches = term
    ? byStatus.filter((c) =>
        (c.customers?.full_name ?? "").includes(term) ||
        (c.party_name ?? "").includes(term) ||
        (c.bank_name ?? "").includes(term) ||
        c.check_number.includes(term) ||
        String(c.the_number ?? "").includes(term),
      )
    : byStatus;

  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro title="الشيكات" subtitle="شيك وارد من عميل أو صادر له: يُسجّل برقمه وبنكه واستحقاقه، وعند التحصيل يتحرك الصندوق ويظهر في كشف حساب العميل." />
      <Segments
        ariaLabel="اتجاه الشيكات"
        options={TYPES.map((t) => ({ value: t, label: `شيكات ${t}ة` }))}
        value={type}
        onChange={setType}
      />
      <Segments
        ariaLabel="حالة الشيكات"
        options={(["الكل", "تحت التحصيل", "مستحقة", "محصل", "مرتجع"] as const).map((s) => ({ value: s, label: s }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />
      <DocumentToolbar
        selected={sel != null}
        canCreate={permissions.can("create")}
        canDelete={permissions.can("delete")}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (sel != null) { del.mutate(sel); setSel(null); } }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
        
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث برقم الشيك أو الاسم أو البنك" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <CheckForm type={type} onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={data.length === 0 ? `لا توجد شيكات ${type}ة بعد` : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "سجّل أول شيك برقمه وبنكه وتاريخ استحقاقه." : "جرّب البحث برقم أو اسم أو بنك آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((c) => (
            <ListItem key={c.id} className={sel === c.id ? selectedRowCls : ""}>
              <div role="button" tabIndex={0} aria-pressed={sel === c.id} onClick={() => setSel(sel === c.id ? null : c.id)} className="cursor-pointer">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">
                  <span className="ledger-figures text-primary">{documentNumber(type === "وارد" ? "check_in" : "check_out", c.document_number)}</span> · شيك {c.check_number}
                </p>
                <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>
              </div>
              <p className="mt-1 truncate text-sm">{c.customers?.full_name ?? c.party_name ?? "—"}{c.bank_name ? ` — ${c.bank_name}` : ""}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="ledger-figures min-w-0 truncate font-medium text-foreground">
                  {fmtMoney(c.amount, c.currencies?.currency_name)}
                </span>
                <span className="ledger-figures shrink-0">{c.due_date ? `يستحق ${c.due_date}` : c.the_date}</span>
              </div>
              {c.notes && <p className="mt-1 text-[11px] text-muted-foreground">{c.notes}</p>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {c.customer_id && (
                    <Link
                      to="/statement"
                      search={{ type: "customer", id: c.customer_id }}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                    >
                      كشف حساب
                    </Link>
                  )}
                  {c.status === "تحت التحصيل" && permissions.can("update") && (permissions.can("collect") || permissions.can("bounce")) && (
                    <>
                      {permissions.can("collect") && <button
                        type="button"
                        onClick={() => { setCollectId(collectId === c.id ? null : c.id); setCollectBox(""); }}
                        className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                      >
                        تحصيل
                      </button>}
                      {permissions.can("bounce") && <button
                        type="button"
                        disabled={bounce.isPending}
                        onClick={async () => { if (await confirmAsk(`تسجيل الشيك ${c.check_number} مرتجعًا؟`)) bounce.mutate(c.id); }}
                        className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive"
                      >
                        إرجاع
                      </button>}
                    </>
                  )}
                </div>
                {isManager && permissions.can("delete") && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async () => { if (await confirmAsk(`حذف الشيك ${c.check_number}؟ تُحذف حركته من الصندوق معه.`)) del.mutate(c.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
              {collectId === c.id && (
                <div className="mt-2 grid gap-2 rounded-xl border border-border/60 bg-paper shadow-card p-2">
                  <BoxSelect value={collectBox} onChange={setCollectBox} />
                  <Button size="sm" disabled={collect.isPending || !collectBox} onClick={() => confirmOperation(`تحصيل الشيك ${c.check_number} في الصندوق`, () => collect.mutate(c.id))}>
                    تأكيد التحصيل في الصندوق
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

function CheckForm({ type, onDone }: { type: CheckType; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ check_number: "", bank_id: "", book_id: "", customer_id: "", party_name: "", beneficiary_name: "", check_account_number: "", check_account_name: "", amount: "", currency_id: "", exchange_amount: "", exchange_currency_id: "", the_date: adenDate(), due_date: "", notes: "" });

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
  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, bank_name").order("bank_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: books = [] } = useQuery({
    queryKey: ["check_books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_books")
        .select("id, bank_id, from_number, to_number, banks(bank_name)")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as unknown as { id: number; bank_id: number | null; from_number: number; to_number: number; banks: { bank_name: string } | null }[];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const bank = banks.find((b) => String(b.id) === f.bank_id);
      const { error } = await supabase.from("checks").insert({
        check_type: type,
        check_number: f.check_number.trim(),
        bank_id: f.bank_id ? Number(f.bank_id) : null,
        bank_name: bank?.bank_name ?? null,
        book_id: f.book_id ? Number(f.book_id) : null,
        customer_id: f.customer_id ? Number(f.customer_id) : null,
        party_name: f.customer_id ? null : f.party_name.trim() || null,
        beneficiary_name: f.beneficiary_name.trim() || null,
        check_account_number: f.check_account_number.trim() || null,
        check_account_name: f.check_account_name.trim() || null,
        amount: Number(f.amount),
        currency_id: Number(f.currency_id),
        exchange_amount: f.exchange_amount ? Number(f.exchange_amount) : null,
        exchange_currency_id: f.exchange_currency_id ? Number(f.exchange_currency_id) : null,
        the_date: f.the_date,
        due_date: f.due_date || null,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سُجّل الشيك تحت التحصيل");
      qc.invalidateQueries({ queryKey: ["checks"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم الشيك">
          <Input required placeholder="مثال: 123456" value={f.check_number} onChange={set("check_number")} className="ledger-figures" />
        </Field>
        <Field label="البنك">
          <select required className={selectCls} value={f.bank_id} onChange={set("bank_id")}>
            <option value="">اختر البنك</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
          </select>
        </Field>
      </div>
      {type === "صادر" && books.length > 0 && (
        <Field label="دفتر الشيكات">
          <select className={selectCls} value={f.book_id} onChange={set("book_id")}>
            <option value="">بدون دفتر</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banks?.bank_name ?? "دفتر"} — من {b.from_number} إلى {b.to_number}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم حساب الشيك">
          <Input placeholder="اختياري" value={f.check_account_number} onChange={set("check_account_number")} className="ledger-figures" />
        </Field>
        <Field label="اسم صاحب الحساب">
          <Input placeholder="اختياري" value={f.check_account_name} onChange={set("check_account_name")} />
        </Field>
      </div>
      <Field label="المستفيد">
        <Input placeholder="اسم المستفيد من الشيك (اختياري)" value={f.beneficiary_name} onChange={set("beneficiary_name")} />
      </Field>
      <Field label="العميل">
        <select className={selectCls} value={f.customer_id} onChange={set("customer_id")}>
          <option value="">{type === "وارد" ? "من عميل مسجل (أو اكتب الاسم تحت)" : "لعميل مسجل (أو اكتب الاسم تحت)"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.the_user_id ? `${c.the_user_id} — ` : ""}{c.full_name}</option>
          ))}
        </select>
      </Field>
      {!f.customer_id && (
        <Field label="الاسم">
          <Input placeholder="الاسم لغير المسجلين" value={f.party_name} onChange={set("party_name")} />
        </Field>
      )}
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ المقابل (اختياري)">
          <Input inputMode="decimal" placeholder="بعملة أخرى" value={f.exchange_amount} onChange={set("exchange_amount")} className="ledger-figures" />
        </Field>
        <Field label="عملة المقابل">
          <select className={selectCls} value={f.exchange_currency_id} onChange={set("exchange_currency_id")}>
            <option value="">—</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="تاريخ الشيك">
          <Input required type="date" value={f.the_date} onChange={set("the_date")} className="ledger-figures" />
        </Field>
        <Field label="تاريخ الاستحقاق">
          <Input type="date" value={f.due_date} onChange={set("due_date")} className="ledger-figures" />
        </Field>
      </div>
      <Field label="البيان">
        <Input placeholder="ملاحظة عن الشيك" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || (!f.customer_id && !f.party_name.trim())}>
        حفظ الشيك
      </Button>
    </FormCard>
  );
}
