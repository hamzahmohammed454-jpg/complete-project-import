import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Coins, Search } from "lucide-react";
import { toast } from "sonner";

import { RowActions } from "@/components/row-actions";
import { PendingNote, SectionIntro } from "@/components/section";
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
  SectionCard,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";
import { fmt, fmtDateTime } from "@/lib/money";
import { confirmOperation } from "@/lib/operation-confirmation";

export const Route = createFileRoute("/_authenticated/currencies")({
  head: () => ({ meta: [{ title: "العملات والأسعار — ابو طه للصرافة" }, { name: "description", content: "العملات وحدود البيع والشراء وسجل تغييرات الأسعار." }, { property: "og:title", content: "العملات والأسعار — ابو طه للصرافة" }, { property: "og:description", content: "أسعار العملات اليومية والتاريخية وحدود التداول." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CurrenciesScreen,
});

type Currency = { id: number; the_number: number; currency_name: string; arabic_code: string | null; min_sell_price: number | null; max_buy_price: number | null };

function CurrenciesScreen() {
  const qc = useQueryClient();
  const { isAdmin } = useAppRoles();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("*").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("currencies").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => { toast.success("حُذفت العملة"); qc.invalidateQueries({ queryKey: ["currencies"] }); },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });
  const term = q.trim();
  const shown = term
    ? data.filter((c) => c.currency_name.includes(term) || (c.arabic_code ?? "").includes(term) || String(c.the_number).includes(term))
    : data;
  return (
    <>
      <MenuStrip tab="/exchange" />
      <SectionIntro title="العملات والأسعار" subtitle="العملات المعتمدة وأسعار الشراء والبيع اليومية." />
      {isAdmin && <Button className="mb-4" onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة عملة"}</Button>}
      {open && <CurrencyForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["currencies"] }); }} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <PendingNote text="لا توجد عملات بعد. ستُنقل عملاتك وأسعارها من نظامك القديم عند وصول بياناتها، أو أضف عملة يدويًا." />
      ) : (
        <>
          <DailyRates currencies={data} />
          <RateHistory currencies={data} />
          <SectionCard title="العملات المعتمدة" aside={`${shown.length} عملة`}>
            <Toolbar
              className="mb-3"
              search={<Input placeholder="بحث باسم العملة أو رمزها" value={q} onChange={(e) => setQ(e.target.value)} />}
            />
            {shown.length === 0 ? (
              <EmptyState icon={Search} title="لا نتائج مطابقة للبحث" hint="جرّب البحث باسم عملة أو رمز آخر." />
            ) : (
              <ul className="space-y-2">
                {shown.map((c) => (
                  <ListItem key={c.id}>
                    <div className="flex items-center gap-3">
                      <span className="ledger-figures shrink-0 text-sm text-primary">{c.the_number}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.currency_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.arabic_code}</span>
                    </div>
                    {(c.min_sell_price != null || c.max_buy_price != null) && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        حدود السعر:
                        {c.max_buy_price != null && <> أعلى شراء <span className="ledger-figures">{fmt(c.max_buy_price)}</span></>}
                        {c.min_sell_price != null && <> · أدنى بيع <span className="ledger-figures">{fmt(c.min_sell_price)}</span></>}
                      </p>
                    )}
                    {isAdmin && (
                      <div className="mt-2">
                        <RowActions canEdit canDelete pending={del.isPending} onEdit={() => setEditing(editing === c.id ? null : c.id)} onDelete={() => del.mutate(c.id)} />
                      </div>
                    )}
                    {editing === c.id && <CurrencyForm initial={c} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["currencies"] }); }} />}
                  </ListItem>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}

type PriceRow = { source_currency_id: number; buy_price: number; sell_price: number; exchange_price: number; updated_at: string };

/** Current pair prices are upserted; the database trigger records immutable history. */
function DailyRates({ currencies }: { currencies: { id: number; currency_name: string }[] }) {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const local = currencies[0];
  const foreign = currencies.slice(1);
  const [draft, setDraft] = useState<Record<number, { buy: string; sell: string }>>({});

  const { data: latest = new Map<number, PriceRow>() } = useQuery({
    queryKey: ["currency_prices_latest", local?.id],
    enabled: Boolean(local),
    queryFn: async () => {
      if (!local) return new Map<number, PriceRow>();
      const { data, error } = await supabase
        .from("currency_prices")
        .select("source_currency_id, buy_price, sell_price, exchange_price, updated_at")
        .eq("target_currency_id", local.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const m = new Map<number, PriceRow>();
      for (const r of data) if (!m.has(r.source_currency_id)) m.set(r.source_currency_id, r);
      return m;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!local) throw new Error("EMPTY");
      const rows = foreign
        .map((c) => {
          const d = draft[c.id];
          const prev = latest.get(c.id);
          const buy = Number(d?.buy ?? prev?.buy_price ?? 0);
          const sell = Number(d?.sell ?? prev?.sell_price ?? 0);
          if (!d || !(buy > 0) || !(sell > 0)) return null;
          return {
            source_currency_id: c.id,
            target_currency_id: local.id,
            buy_price: buy,
            sell_price: sell,
            exchange_price: (buy + sell) / 2,
            min_price: Math.min(buy, sell),
            max_price: Math.max(buy, sell),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length === 0) throw new Error("EMPTY");
      const { error } = await supabase.from("currency_prices").upsert(rows, { onConflict: "source_currency_id,target_currency_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظت أسعار اليوم");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["currency_prices_latest"] });
      qc.invalidateQueries({ queryKey: ["latest_rates"] });
      qc.invalidateQueries({ queryKey: ["currency_prices"] });
      qc.invalidateQueries({ queryKey: ["rate-history"] });
    },
    onError: (e: Error) => toast.error(e.message === "EMPTY" ? "عدّل سعرًا واحدًا على الأقل" : "تعذّر الحفظ — تعديل الأسعار للمدير فقط"),
  });

  if (!local || foreign.length === 0) return null;
  return (
    <SectionCard title="أسعار اليوم" aside={`مقابل ${local.currency_name}`} className="mb-5">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 text-xs">
        <span className="text-muted-foreground">العملة</span>
        <span className="text-center text-muted-foreground">شراء</span>
        <span className="text-center text-muted-foreground">بيع</span>
        {foreign.map((c) => {
          const prev = latest.get(c.id);
          const d = draft[c.id];
          const val = (k: "buy" | "sell") => d?.[k] ?? (prev ? String(k === "buy" ? prev.buy_price : prev.sell_price) : "");
          const set = (k: "buy" | "sell") => (e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft({ ...draft, [c.id]: { buy: val("buy"), sell: val("sell"), [k]: e.target.value } });
          return (
            <div key={c.id} className="contents">
              <span className="min-w-0 text-sm font-medium">
                {c.currency_name}
                {prev && <span className="block truncate text-[10px] font-normal text-muted-foreground">آخر تحديث {fmtDateTime(prev.updated_at)}</span>}
              </span>
              {isManager ? (
                <>
                  <Input inputMode="decimal" value={val("buy")} onChange={set("buy")} className="ledger-figures h-8 px-1 text-center" aria-label={`سعر شراء ${c.currency_name}`} />
                  <Input inputMode="decimal" value={val("sell")} onChange={set("sell")} className="ledger-figures h-8 px-1 text-center" aria-label={`سعر بيع ${c.currency_name}`} />
                </>
              ) : (
                <>
                  <span className="ledger-figures text-center">{prev ? fmt(prev.buy_price) : "—"}</span>
                  <span className="ledger-figures text-center">{prev ? fmt(prev.sell_price) : "—"}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      {isManager ? (
        <Button className="mt-3 w-full" disabled={save.isPending || Object.keys(draft).length === 0} onClick={() => confirmOperation("حفظ أسعار العملات", () => save.mutate())}>
          حفظ أسعار اليوم
        </Button>
      ) : (
        <Notice tone="info" className="mt-3">تعديل الأسعار للمدير فقط.</Notice>
      )}
    </SectionCard>
  );
}

function RateHistory({ currencies }: { currencies: { id: number; currency_name: string }[] }) {
  const [currency, setCurrency] = useState("");
  const query = useQuery({ queryKey: ["rate-history", currency], queryFn: async () => {
    let request = supabase.from("currency_rate_history").select("*").order("changed_at", { ascending: false }).limit(100);
    if (currency) request = request.eq("source_currency_id", Number(currency));
    const { data, error } = await request; if (error) throw error; return data;
  } });
  const name = (id: number) => currencies.find((c) => c.id === id)?.currency_name ?? id;
  return <section className="mb-6 border-b border-border pb-4"><h2 className="mb-3 font-semibold">سجل الأسعار التاريخي</h2><Field label="العملة"><select className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">كل العملات</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}</select></Field>{query.isError ? <Notice tone="danger">تعذّر تحميل سجل الأسعار.</Notice> : <ul className="mt-3 space-y-2">{query.data?.map((r) => <li key={r.id} className="border-b border-border py-2 text-xs"><p>{name(r.source_currency_id)} / {name(r.target_currency_id)}</p><p className="ledger-figures mt-1">شراء {fmt(r.buy_price)} · بيع {fmt(r.sell_price)} · {fmtDateTime(r.changed_at)}</p></li>)}</ul>}</section>;
}

function CurrencyForm({ initial, onDone }: { initial?: Currency; onDone: () => void }) {
  const [f, setF] = useState({
    num: "",
    name: initial?.currency_name ?? "",
    code: initial?.arabic_code ?? "",
    minSell: initial?.min_sell_price != null ? String(initial.min_sell_price) : "",
    maxBuy: initial?.max_buy_price != null ? String(initial.max_buy_price) : "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const limits = {
        min_sell_price: f.minSell ? Number(f.minSell) : null,
        max_buy_price: f.maxBuy ? Number(f.maxBuy) : null,
      };
      if (initial) {
        const { data, error } = await supabase
          .from("currencies")
          .update({ currency_name: f.name.trim(), arabic_code: f.code.trim() || null, ...limits })
          .eq("id", initial.id)
          .select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("currencies").insert({
        the_number: Number(f.num), currency_name: f.name.trim(), arabic_code: f.code.trim() || null, ...limits,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(initial ? "حُفظ التعديل" : "أُضيفت العملة"); onDone(); },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "لم تُحفظ: الرقم أو الاسم مكرر، أو لا تملك صلاحية المدير"),
  });
  return (
    <FormCard
      className={initial ? "mt-3 mb-0" : undefined}
      onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
    >
      {!initial && (
        <Field label="رقم العملة">
          <Input required inputMode="numeric" placeholder="مثال: 3" value={f.num} onChange={(e) => setF({ ...f, num: e.target.value.replace(/\D/g, "") })} className="ledger-figures" />
        </Field>
      )}
      <Field label="اسم العملة">
        <Input required placeholder="مثال: ريال سعودي" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="الرمز العربي">
        <Input placeholder="مثال: ر.س" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="أعلى سعر شراء">
          <Input inputMode="decimal" placeholder="اختياري" value={f.maxBuy} onChange={(e) => setF({ ...f, maxBuy: e.target.value })} className="ledger-figures" />
        </Field>
        <Field label="أدنى سعر بيع">
          <Input inputMode="decimal" placeholder="اختياري" value={f.minSell} onChange={(e) => setF({ ...f, minSell: e.target.value })} className="ledger-figures" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}
