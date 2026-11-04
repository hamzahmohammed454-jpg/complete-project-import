import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PieChart } from "lucide-react";
import { useMemo } from "react";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { DataTable, LoadingRows, Notice, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { debtorCreditorStats, type CurrencyStats } from "@/lib/statistics";

export const Route = createFileRoute("/_authenticated/statistics")({
  head: () => ({ meta: [{ title: "الإحصائيات — ابو طه للصرافة" }, { name: "description", content: "إحصائيات المدينين والدائنين وأرصدة الحسابات مصنفة حسب العملة." }, { property: "og:title", content: "الإحصائيات — ابو طه للصرافة" }, { property: "og:description", content: "إحصائيات المدينين والدائنين وأرصدة الحسابات مصنفة حسب العملة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: StatisticsScreen,
});

function StatisticsScreen() {
  const currencies = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const moves = useQuery({
    queryKey: ["statistics_moves"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entries_details").select("account_id, currency_id, side, amount");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => debtorCreditorStats(moves.data ?? []), [moves.data]);
  const rows = useMemo(() => {
    const out: ({ name: string } & CurrencyStats)[] = [];
    for (const c of currencies.data ?? []) {
      const s = stats.get(c.id);
      if (s) out.push({ name: c.currency_name, ...s });
    }
    return out;
  }, [currencies.data, stats]);

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro
        title="الإحصائيات"
        subtitle="إجمالي المدينون والدائنون بكل عملة: من لنا عليهم ومن لهم علينا، بعدد الحسابات والمبالغ."
      />

      {moves.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <Notice tone="info">لا توجد حركات قيود بعد، فلا إحصائيات لعرضها.</Notice>
      ) : (
        <>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-positive/40 bg-card p-3 text-center">
            <p className="text-sm font-bold">إجمالي المدينين</p>
            <p className="ledger-figures text-2xl font-bold text-positive">{rows.reduce((s, r) => s + r.debtorsCount, 0)}</p>
            <p className="text-[11px] text-muted-foreground">حساب لنا عليه</p>
          </div>
          <div className="rounded-2xl border border-destructive/40 bg-card p-3 text-center">
            <p className="text-sm font-bold">إجمالي الدائنين</p>
            <p className="ledger-figures text-2xl font-bold text-destructive">{rows.reduce((s, r) => s + r.creditorsCount, 0)}</p>
            <p className="text-[11px] text-muted-foreground">حساب له علينا</p>
          </div>
        </div>
        <DataTable head={["العملة", "مدينون (لنا)", "دائنون (لهم)"]}>
          {rows.map((r) => (
            <Tr key={r.name}>
              <Td>
                <span className="inline-flex items-center gap-2 font-medium">{r.name}</span>
              </Td>
              <Td money align="end">
                <span className="font-semibold text-positive">{fmt(r.debtorsTotal)}</span>
                <span className="block text-[10px] text-muted-foreground">{r.debtorsCount} حساب</span>
              </Td>
              <Td money align="end">
                <span className="font-semibold text-destructive">{fmt(r.creditorsTotal)}</span>
                <span className="block text-[10px] text-muted-foreground">{r.creditorsCount} حساب</span>
              </Td>
            </Tr>
          ))}
        </DataTable>
        </>
      )}

      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <PieChart className="size-4" />
        المدينون حسابات صافيها لصالحنا، والدائنون حسابات صافيها علينا — من مجموع القيود المرحّلة.
      </p>
    </>
  );
}
