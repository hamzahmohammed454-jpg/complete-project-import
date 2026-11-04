import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { LoadingRows, Notice, SectionCard, Segments } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { buildStatements, type ChartAccount, type StatementLine } from "@/lib/financials";
import type { DetailRow } from "@/lib/reports";
import { collectPages } from "@/lib/paginated-read";

export const Route = createFileRoute("/_authenticated/financials")({
  head: () => ({ meta: [{ title: "القوائم المالية — ابو طه للصرافة" }, { name: "description", content: "قائمة الدخل والمركز المالي من القيود لكل عملة بصورة مستقلة." }, { property: "og:title", content: "القوائم المالية — ابو طه للصرافة" }, { property: "og:description", content: "الإيرادات والمصروفات والأصول والخصوم من القيود المسجلة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: FinancialsScreen,
});

function Block({ title, lines, total }: { title: string; lines: StatementLine[]; total: number }) {
  return (
    <div className="mb-3 last:mb-0">
      <h3 className="mb-1 text-sm font-semibold text-primary">{title}</h3>
      {lines.length === 0 ? (
        <Notice tone="info" icon={FileText}>لا توجد أرصدة في هذا القسم.</Notice>
      ) : (
        <ul className="ledger-figures text-sm">
          {lines.map((l) => (
            <li key={l.account_id} className="flex justify-between gap-2 border-b border-border/60 py-1.5">
              <span className="min-w-0 truncate">{l.name}</span>
              <span className="shrink-0">{fmt(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ledger-figures mt-1 flex justify-between gap-2 border-t-2 border-border pt-1.5 text-sm font-bold">
        <span>إجمالي {title}</span><span>{fmt(total)}</span>
      </div>
    </div>
  );
}

function FinancialsScreen() {
  const [selectedCurrency, setCurrencyId] = useState<number | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["financials"],
    queryFn: async () => {
      const [cur, acc, det] = await Promise.all([
        supabase.from("currencies").select("id, currency_name").order("the_number"),
        collectPages(async (from, until) => {
          const result = await supabase.from("accounts").select("id, account_number, father_number, account_name").order("id").range(from, until);
          if (result.error) throw result.error; return result.data;
        }),
        collectPages(async (from, until) => {
          const result = await supabase.from("entries_details").select("account_id, currency_id, side, amount").order("id").range(from, until);
          if (result.error) throw result.error; return result.data;
        }),
      ]);
      if (cur.error) throw cur.error;
      return {
        currencies: cur.data ?? [],
        accounts: acc as ChartAccount[],
        details: det as DetailRow[],
      };
    },
  });

  const currencyId = selectedCurrency ?? data?.currencies[0]?.id ?? 0;
  const s = useMemo(() => buildStatements(data?.accounts ?? [], data?.details ?? [], currencyId), [data, currencyId]);
  const equityTotal = s.totals.equity + s.netProfit;
  const balanced = Math.abs(s.totals.assets - (s.totals.liabilities + equityTotal)) < 0.01;
  if (isLoading) return <LoadingRows />;
  if (isError) return <Notice tone="danger">تعذّر تحميل القوائم المالية؛ لا يمكن عرض أرصدة موثوقة.</Notice>;
  if (!data?.currencies.length) return <Notice>أضف العملات الفعلية قبل عرض القوائم المالية.</Notice>;

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="القوائم المالية" subtitle="قائمة الأرباح والخسائر وقائمة المركز المالي من القيود، لكل عملة على حدة." />

      <Segments
        ariaLabel="العملة"
        options={(data?.currencies ?? []).map((c) => ({ value: String(c.id), label: c.currency_name }))}
        value={String(currencyId)}
        onChange={(v) => setCurrencyId(Number(v))}
      />

      <SectionCard title="قائمة الأرباح والخسائر">
        <Block title="الإيرادات" lines={s.sections.revenue} total={s.totals.revenue} />
        <Block title="المصروفات" lines={s.sections.expenses} total={s.totals.expenses} />
        <Notice tone={s.netProfit >= 0 ? "success" : "danger"}>
          <span className="ledger-figures flex w-full justify-between gap-2 font-bold">
            <span>{s.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}</span>
            <span>{fmt(Math.abs(s.netProfit))}</span>
          </span>
        </Notice>
      </SectionCard>

      <SectionCard title="قائمة المركز المالي">
        <Block title="الأصول" lines={s.sections.assets} total={s.totals.assets} />
        <Block title="الخصوم" lines={s.sections.liabilities} total={s.totals.liabilities} />
        <Block
          title="حقوق الملكية"
          lines={[...s.sections.equity, ...(s.netProfit !== 0 ? [{ account_id: -1, name: "صافي ربح/خسارة الفترة", amount: s.netProfit }] : [])]}
          total={equityTotal}
        />
        <div className="ledger-figures mt-1 flex justify-between gap-2 rounded-lg bg-muted p-2 text-sm font-bold">
          <span>الخصوم + حقوق الملكية</span><span>{fmt(s.totals.liabilities + equityTotal)}</span>
        </div>
        <Notice tone={balanced ? "info" : "danger"} className="mt-2">
          {balanced ? "القائمة متوازنة: الأصول = الخصوم + حقوق الملكية." : "القائمة غير متوازنة — راجع القيود غير المكتملة."}
        </Notice>
      </SectionCard>
    </>
  );
}
