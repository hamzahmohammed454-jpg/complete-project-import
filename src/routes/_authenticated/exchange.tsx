import { useSystemSettings } from "@/hooks/use-system-settings";
import { exchangeRuleError } from "@/lib/system-settings";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoxSelect, boxErrorMessage } from "@/components/box-select";
import { LiveAmountWords } from "@/components/amount-words";
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
import { computeCommission, findRule, type CommissionRule } from "@/lib/commission";
import { fmt } from "@/lib/money";
import { priceLimitWarning } from "@/lib/price-limits";
import { useWorkDefaults } from "@/hooks/use-work-defaults";
import { defaultCurrencyId } from "@/lib/staff-defaults";
import { tradeAllowed } from "@/lib/staff-defaults";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { documentNumber } from "@/lib/document-number";
import { pendingResult } from "@/lib/offline/outbox-core";

type Kind = "buy" | "sell";

export const Route = createFileRoute("/_authenticated/exchange")({
  head: () => ({ meta: [{ title: "البيع والشراء — ابو طه للصرافة" }, { name: "description", content: "عمليات شراء وبيع العملات بأسعار اليوم وإعدادات عمل الموظف." }, { property: "og:title", content: "البيع والشراء — ابو طه للصرافة" }, { property: "og:description", content: "عمليات شراء وبيع العملات بأسعار اليوم وإعدادات عمل الموظف." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  // بطاقات الرئيسية تفتح نوع العملية المطلوب مباشرة: /exchange?kind=buy
  validateSearch: (search: Record<string, unknown>): { kind?: Kind } =>
    search["kind"] === "buy" || search["kind"] === "sell" ? { kind: search["kind"] as Kind } : {},
  component: ExchangeScreen,
});

function ExchangeScreen() {
  // كل عملية شاشة مستقلة تُفتح من أيقونتها: الشراء وحده والبيع وحده، بلا زر تبديل بينهما
  const kind: Kind = Route.useSearch().kind ?? "buy";
  const [open, setOpen] = useState(false);
  const { data: defaults, isLoading: defaultsLoading } = useWorkDefaults();
  const { isAdmin, roles, isLoading: rolesLoading } = useAppRoles();
  const permissions = useScreenPermissions("/exchange");
  const allowed = tradeAllowed(defaults, kind, isAdmin);
  const canOperate = roles.some((role) => ["admin", "manager", "teller"].includes(role));
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => { setOpen(false); setSel(null); }, [kind]);
  const table = kind === "buy" ? "buy_currencies" : "sell_currencies";

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, document_number, the_number, payment_method, customers(full_name), amount, price, exchange_amount, commission, cash_customer_name, the_date, currencies!currency_id(currency_name), exchange_currency:currencies!exchange_currency_id(currency_name)")
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const term = q.trim();
  const data = term
    ? rows.filter((op) => (op.cash_customer_name ?? "").includes(term) || documentNumber(kind, op.document_number).includes(term))
    : rows;

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("لم يُحذف السند — لا تملك صلاحية الحذف");
    },
    onSuccess: () => { toast.success("حُذفت العملية وحركتها من الصندوق"); setSel(null); qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر الحذف"),
  });

  return (
    <>
      <MenuStrip tab="/exchange" />
      <SectionIntro
        title={kind === "buy" ? "شراء العملات النقدية" : "بيع العملات النقدية"}
        subtitle={kind === "buy" ? "شراء عملة من الزبون بسعر الشراء اليومي المعتمد." : "بيع عملة للزبون بسعر البيع اليومي المعتمد."}
      />
      <DocumentToolbar
        selected={sel != null}
        canCreate={!defaultsLoading && !rolesLoading && allowed && canOperate && permissions.can("create")}
        canDelete={permissions.can("delete")}
        canPrint={permissions.can("print")}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => sel != null && del.mutate(sel)}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => setShowSearch((v) => !v)}
        onPrintVoucher={() => sel != null && navigate({ to: "/voucher/$kind/$id", params: { kind, id: String(sel) } })}
      />
      {showSearch && <Input autoFocus className="mb-3" placeholder="بحث بالاسم أو رقم السند" value={q} onChange={(e) => setQ(e.target.value)} />}
      {open && allowed && permissions.can("create") && <ExchangeForm key={kind} kind={kind} onDone={() => setOpen(false)} />}
      {!allowed ? <Notice>غير مسموح لك بعمليات {kind === "buy" ? "الشراء" : "البيع"}.</Notice> : isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={`لا توجد عمليات ${kind === "buy" ? "شراء" : "بيع"} بعد`}
          hint="ابدأ بإضافة عملية جديدة بسعر اليوم."
        />
      ) : (
        <ul className="space-y-2">
          {data.map((op) => (
            <ListItem key={op.id} className={cn("cursor-pointer", sel === op.id && selectedRowCls)}>
              <div role="button" tabIndex={0} aria-pressed={sel === op.id} onClick={() => setSel(sel === op.id ? null : op.id)}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="ledger-figures min-w-0 truncate text-sm font-semibold text-primary">{documentNumber(kind, op.document_number)}</p>
                <span className="ledger-figures shrink-0 text-[11px] text-muted-foreground">{op.the_date}</span>
              </div>
              <p className="mt-1 truncate text-sm">
                {op.payment_method === "account"
                  ? <>حساب: {(op.customers as { full_name: string } | null)?.full_name ?? "—"}</>
                  : <>نقد · {op.cash_customer_name || "زبون نقدي"}</>}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="ledger-figures min-w-0 truncate">
                  {fmt(op.amount)} {(op.currencies as { currency_name: string } | null)?.currency_name ?? ""} × {fmt(op.price)}
                </span>
                <span className="ledger-figures min-w-0 shrink-0 truncate font-medium text-foreground">
                  {op.exchange_amount != null ? fmt(op.exchange_amount) : "—"}{" "}
                  {(op.exchange_currency as { currency_name: string } | null)?.currency_name ?? ""}
                </span>
              </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                  {Number(op.commission) > 0 && <>عمولة <span className="ledger-figures">{fmt(op.commission)}</span></>}
                </span>
                {permissions.can("print") && <Link
                  to="/voucher/$kind/$id"
                  params={{ kind, id: String(op.id) }}
                  className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                >
                  سند
                </Link>}
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function ExchangeForm({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: defaults } = useWorkDefaults();
  const table = kind === "buy" ? "buy_currencies" : "sell_currencies";
  const [f, setF] = useState({ amount: "", currency_id: "", price: "", exchange_currency_id: "", customer: "", phone: "", notes: "", commission: "", box_id: "", method: "cash", customer_id: "" });
  const viaAccount = f.method === "account";

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, the_user_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const setBox = (v: string) => setF((p) => ({ ...p, box_id: v }));

  const { data: rules = [] } = useQuery({
    queryKey: ["commission_rules_engine"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commission_rules").select("*");
      if (error) throw error;
      return data as CommissionRule[];
    },
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name, min_sell_price, max_buy_price").order("the_number");
      if (error) throw error;
      return data;
    },
  });

  // السعر اليومي المعتمد للعملة المختارة
  useEffect(() => {
    const currency = defaultCurrencyId(defaults?.currency_id, currencies);
    if (currency) setF((previous) => previous.currency_id && !defaults?.enforce_currency ? previous : { ...previous, currency_id: currency });
  }, [defaults, currencies]);

  const { data: priceRow } = useQuery({
    queryKey: ["currency_prices", f.currency_id, f.exchange_currency_id],
    enabled: Boolean(f.currency_id && f.exchange_currency_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_prices")
        .select("buy_price, sell_price")
        .eq("source_currency_id", Number(f.currency_id))
        .eq("target_currency_id", Number(f.exchange_currency_id))
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const dailyPrice = priceRow ? (kind === "buy" ? priceRow.buy_price : priceRow.sell_price) : null;
  const effectivePrice = f.price ? Number(f.price) : (dailyPrice ?? 0);
  const selectedCurrency = currencies.find((c) => c.id === Number(f.currency_id));
  const limitWarning = priceLimitWarning(kind, effectivePrice, selectedCurrency);
  const total = useMemo(() => {
    const a = Number(f.amount);
    return a > 0 && effectivePrice > 0 ? a * effectivePrice : null;
  }, [f.amount, effectivePrice]);

  // العمولة: تُحسب من نظام العمولات على المبلغ بعملته، وتُقبض بعملة المقابل
  const rule = f.amount
    ? findRule(rules, { documentType: kind, amount: Number(f.amount), currencyId: f.currency_id ? Number(f.currency_id) : null, agentId: null })
    : null;
  const autoCommission = rule ? computeCommission(rule, Number(f.amount)) : null;
  const commission = f.commission ? Number(f.commission) : (autoCommission ?? 0);

  const setting = useSystemSettings();
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from(table).insert({
        payment_method: viaAccount ? "account" : "cash",
        customer_id: viaAccount ? Number(f.customer_id) : null,
        box_id: !viaAccount && f.box_id ? Number(f.box_id) : null,
        commission,
        amount: Number(f.amount),
        currency_id: Number(f.currency_id),
        price: effectivePrice,
        exchange_amount: total,
        exchange_currency_id: f.exchange_currency_id ? Number(f.exchange_currency_id) : null,
        cash_customer_name: f.customer.trim() || null,
        customer_phone: f.phone.trim() || null,
        notes: f.notes.trim() || null,
      }).select("id").setHeader("x-offline-intent", "true");
      if (error) throw error;
      return pendingResult(data);
    },
    onSuccess: (pending) => {
      if (pending) toast.info("حُفظت على الهاتف بانتظار الإرسال؛ لم تُرحّل ولم يتغير الرصيد. راجع قائمة المزامنة.");
      else toast.success("حُفظت العملية");
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      onDone();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); const err = exchangeRuleError(setting, viaAccount ? "account" : "cash", f.customer); if (err) { toast.error(err); return; } m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input required inputMode="decimal" placeholder="0" value={f.amount} onChange={set("amount")} className="ledger-figures" />
        </Field>
        <Field label="العملة">
          <select required disabled={defaults?.enforce_currency} className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="عملة المقابل">
          <select required className={selectCls} value={f.exchange_currency_id} onChange={set("exchange_currency_id")}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
        <Field label="السعر">
          <Input
            inputMode="decimal"
            placeholder={dailyPrice ? `اليومي: ${fmt(dailyPrice)}` : "السعر"}
            value={f.price}
            onChange={set("price")}
            className="ledger-figures"
          />
        </Field>
      </div>
      {limitWarning && <Notice tone="warn">{limitWarning}</Notice>}
      <LiveAmountWords amount={f.amount} currencyName={selectedCurrency?.currency_name ?? ""} />
      {total != null && (
        <Notice tone="success">
          <span className="ledger-figures flex w-full justify-between gap-2 font-semibold">
            <span>الإجمالي</span>
            <span>{fmt(total)}</span>
          </span>
        </Notice>
      )}
      <Field label="العمولة">
        <Input
          inputMode="decimal"
          placeholder={autoCommission != null ? `التلقائية: ${fmt(autoCommission)}` : "اختياري"}
          value={f.commission}
          onChange={set("commission")}
          className="ledger-figures"
        />
      </Field>
      {autoCommission != null && !f.commission && (
        <Notice tone="info">ستُحفظ العمولة <span className="ledger-figures">{fmt(autoCommission)}</span> حسب نظام العمولات.</Notice>
      )}
      <Field label="طريقة الصرف">
        <select className={selectCls} value={f.method} onChange={set("method")}>
          <option value="cash">نقد</option>
          <option value="account">حساب</option>
        </select>
      </Field>
      {viaAccount ? (
        <>
          <Field label="حساب العميل">
            <select required className={selectCls} value={f.customer_id} onChange={set("customer_id")}>
              <option value="">اختر العميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </Field>
          <Notice tone="info">
            {kind === "buy"
              ? "تُضاف العملة المشتراة لحساب العميل، ويُخصم منه المقابل والعمولة بعملة المقابل. لا تدخل نقدية للصندوق."
              : "تُخصم العملة المباعة والعمولة من حساب العميل، ويُضاف له المقابل بعملة المقابل. لا تخرج نقدية من الصندوق."}
          </Notice>
        </>
      ) : (
        <BoxSelect value={f.box_id} onChange={setBox} label="الصندوق" />
      )}
      <Field label="اسم الزبون">
        <Input placeholder="اختياري" value={f.customer} onChange={set("customer")} />
      </Field>
      <Field label="هاتف الزبون">
        <Input inputMode="tel" placeholder="اختياري" value={f.phone} onChange={set("phone")} className="ledger-figures" />
      </Field>
      <Field label="ملاحظات">
        <Input placeholder="بيان إضافي" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || !total || (viaAccount && !f.customer_id)}>حفظ العملية</Button>
    </FormCard>
  );
}
