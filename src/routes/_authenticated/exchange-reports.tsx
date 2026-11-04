import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Field, LoadingRows, Notice, SectionCard, StatusPill, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { documentNumber } from "@/lib/document-number";
import { exchangeTotals, outOfLimits, type ExchangeRow } from "@/lib/exchange-reports";
import { fmt } from "@/lib/money";
import { collectPages } from "@/lib/paginated-read";
import { priceLimitWarning } from "@/lib/price-limits";

type Kind = "buy" | "sell";
type Report = { title: string; kinds: Kind[]; view: "list" | "totals" | "limits"; back: string };

/** كل تقرير يُفتح من أيقونته في قسم البيع والشراء عبر ?r= */
export const EXCHANGE_REPORTS = {
  all: { title: "تقرير البيع والشراء", kinds: ["buy", "sell"], view: "list", back: "exchange-reports" },
  limits: { title: "تقرير العمليات التي تجاوزت الحد الأدنى أو الأعلى", kinds: ["buy", "sell"], view: "limits", back: "exchange-reports" },
  "buy-totals": { title: "إجماليات الشراء", kinds: ["buy"], view: "totals", back: "exchange-totals" },
  "sell-totals": { title: "إجماليات البيع", kinds: ["sell"], view: "totals", back: "exchange-totals" },
} satisfies Record<string, Report>;
type ReportId = keyof typeof EXCHANGE_REPORTS;

export const Route = createFileRoute("/_authenticated/exchange-reports")({
  validateSearch: (s: Record<string, unknown>): { r: ReportId } => ({ r: typeof s["r"] === "string" && s["r"] in EXCHANGE_REPORTS ? (s["r"] as ReportId) : "all" }),
  head: () => ({ meta: [{ title: "تقارير البيع والشراء — ابو طه للصرافة" }, { name: "description", content: "إجماليات وتقارير عمليات بيع وشراء العملات لكل عملة." }, { property: "og:title", content: "تقارير البيع والشراء — ابو طه للصرافة" }, { property: "og:description", content: "إجماليات وتقارير عمليات بيع وشراء العملات لكل عملة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ExchangeReportsScreen,
});

const FIELDS = "id, document_number, the_date, amount, currency_id, price, exchange_amount, exchange_currency_id, commission, cash_customer_name";
const monthStart = () => `${adenDate().slice(0, 8)}01`;

function ExchangeReportsScreen() {
  const { r } = Route.useSearch();
  const rep: Report = EXCHANGE_REPORTS[r];
  const [from, setFrom] = useState(monthStart());
  const [until, setUntil] = useState(adenDate());

  const { data, isLoading, error } = useQuery({
    queryKey: ["exchange-reports", rep.kinds.join(","), from, until],
    queryFn: async () => {
      const load = (kind: Kind) => collectPages(async (a, b) => {
        let q = supabase.from(kind === "buy" ? "buy_currencies" : "sell_currencies").select(FIELDS).order("id", { ascending: false });
        if (from) q = q.gte("the_date", from);
        if (until) q = q.lte("the_date", until);
        const res = await q.range(a, b);
        if (res.error) throw res.error;
        return res.data.map((x) => ({ ...x, kind }) as ExchangeRow);
      });
      const [lists, cur] = await Promise.all([
        Promise.all(rep.kinds.map(load)),
        supabase.from("currencies").select("id, currency_name, min_sell_price, max_buy_price").order("the_number"),
      ]);
      if (cur.error) throw cur.error;
      const rows = lists.flat().sort((x, y) => y.the_date.localeCompare(x.the_date) || y.id - x.id);
      return { rows, currencies: cur.data ?? [] };
    },
  });

  const currency = (id: number | null) => data?.currencies.find((c) => c.id === id);
  const curName = (id: number | null) => currency(id)?.currency_name ?? "—";
  const view = useMemo(() => {
    const all = data?.rows ?? [];
    return rep.view === "limits" ? outOfLimits(all, currency) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rep.view]);

  return (
    <>
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Link to="/section/$id" params={{ id: rep.back }} aria-label="رجوع" className="grid size-10 place-items-center rounded-xl text-foreground"><ArrowRight className="size-6" /></Link>
        <h1 className="display flex-1 text-xl font-bold text-foreground">{rep.title}</h1>
        <Button variant="outline" size="icon" aria-label="طباعة التقرير" title="طباعة" onClick={() => window.print()}><Printer className="size-4" /></Button>
      </div>
      <h1 className="mb-2 hidden text-lg font-bold print:block">{rep.title}</h1>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label="من يوم"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" /></Field>
        <Field label="إلى يوم"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="ledger-figures" /></Field>
      </div>

      {error && <Notice tone="danger">تعذّر تحميل التقرير. تأكد من الاتصال وحاول مرة أخرى.</Notice>}
      {isLoading ? <LoadingRows /> : rep.view === "totals" ? (
        <>
          <TotalsView rows={view} byDay={false} curName={curName} />
          <TotalsView rows={view} byDay curName={curName} />
        </>
      ) : (
        <>
          <SectionCard title="العمليات" aside={`${fmt(view.length, 0)} عملية`}>
            {view.length === 0 ? (
              <Notice tone="info" icon={CalendarDays}>{rep.view === "limits" ? "لا توجد عمليات تجاوزت الحدود في هذه الفترة." : "لا توجد عمليات في هذه الفترة."}</Notice>
            ) : (
              <DataTable head={["رقم السند", "التاريخ", "النوع", "الزبون", "المبلغ", "العملة", "السعر", "المقابل", ...(rep.view === "limits" ? ["التنبيه"] : [])]}>
                {view.map((t) => (
                  <Tr key={`${t.kind}-${t.id}`}>
                    <Td money className="whitespace-nowrap font-semibold text-primary">{documentNumber(t.kind, t.document_number)}</Td>
                    <Td money className="whitespace-nowrap">{t.the_date}</Td>
                    <Td><StatusPill tone={t.kind === "buy" ? "ok" : "warn"}>{t.kind === "buy" ? "شراء" : "بيع"}</StatusPill></Td>
                    <Td>{t.cash_customer_name || "زبون نقدي"}</Td>
                    <Td money align="end" className="font-semibold">{fmt(t.amount)}</Td>
                    <Td>{curName(t.currency_id)}</Td>
                    <Td money align="end">{fmt(t.price)}</Td>
                    <Td money align="end">{t.exchange_amount != null ? fmt(t.exchange_amount) : "—"} {curName(t.exchange_currency_id)}</Td>
                    {rep.view === "limits" && <Td className="text-negative">{priceLimitWarning(t.kind, Number(t.price), currency(t.currency_id))?.replace("تنبيه: ", "")}</Td>}
                  </Tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
          {view.length > 0 && <TotalsView rows={view} byDay={false} curName={curName} split />}
        </>
      )}
    </>
  );
}

function TotalsView({ rows, byDay, curName, split = false }: { rows: readonly ExchangeRow[]; byDay: boolean; curName: (id: number | null) => string; split?: boolean }) {
  const groups: { kind: Kind | null; rows: readonly ExchangeRow[] }[] = split
    ? (["buy", "sell"] as const).map((k) => ({ kind: k, rows: rows.filter((x) => x.kind === k) })).filter((g) => g.rows.length > 0)
    : [{ kind: null, rows }];
  return (
    <>
      {groups.map((g) => {
        const totals = exchangeTotals(g.rows, byDay);
        const label = g.kind === "buy" ? "إجمالي الشراء لكل عملة" : g.kind === "sell" ? "إجمالي البيع لكل عملة" : byDay ? "الإجماليات اليومية لكل عملة" : "الإجمالي لكل عملة";
        return (
          <SectionCard key={g.kind ?? "all"} title={label} aside={`${fmt(g.rows.length, 0)} عملية`}>
            {totals.length === 0 ? <Notice tone="info" icon={CalendarDays}>لا توجد عمليات في هذه الفترة.</Notice> : (
              <DataTable head={[...(byDay ? ["اليوم"] : []), "العملة", "العدد", "المبلغ", "متوسط السعر", "المقابل", "العمولة"]}>
                {totals.map((t) => (
                  <Tr key={`${t.day}-${t.currency_id}-${t.exchange_currency_id}`}>
                    {byDay && <Td money className="whitespace-nowrap">{t.day}</Td>}
                    <Td>{curName(t.currency_id)}</Td>
                    <Td money align="center">{fmt(t.count, 0)}</Td>
                    <Td money align="end" className="font-semibold">{fmt(t.amount)}</Td>
                    <Td money align="end">{fmt(t.avg_price)}</Td>
                    <Td money align="end">{fmt(t.exchange_amount)} {curName(t.exchange_currency_id)}</Td>
                    <Td money align="end">{fmt(t.commission)}</Td>
                  </Tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
        );
      })}
    </>
  );
}
