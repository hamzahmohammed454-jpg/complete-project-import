import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Input } from "@/components/ui/input";
import { DataTable, Field, Notice, SectionCard, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/totals")({
  head: () => ({ meta: [{ title: "الإجماليات — ابو طه للصرافة" }, { name: "description", content: "إجماليات الحوالات والبيع والشراء والعمولات لكل عملة خلال الفترة." }, { property: "og:title", content: "الإجماليات — ابو طه للصرافة" }, { property: "og:description", content: "إجماليات الحوالات والبيع والشراء والعمولات لكل عملة خلال الفترة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TotalsScreen,
});

type TotRow = { currency_id: number | null; amount: number; commission: number | null };

/** Sums amount and commission per currency. */
function totalsByCurrency(rows: readonly TotRow[]) {
  const map = new Map<number, { count: number; amount: number; commission: number }>();
  for (const r of rows) {
    const cur = r.currency_id ?? 0;
    const t = map.get(cur) ?? { count: 0, amount: 0, commission: 0 };
    t.count += 1;
    t.amount += Number(r.amount);
    t.commission += Number(r.commission ?? 0);
    map.set(cur, t);
  }
  return map;
}

function TotalsScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data } = useQuery({
    queryKey: ["totals", from, to],
    queryFn: async () => {
      const range = (q: any) => q.gte("the_date", from).lte("the_date", to);
      const [cur, out_, in_, buy, sell] = await Promise.all([
        supabase.from("currencies").select("id, currency_name").order("the_number"),
        range(supabase.from("outgoing_transfers").select("currency_id, amount, commission:branch_commission").eq("canceled", false)),
        range(supabase.from("incoming_transfers").select("currency_id, amount, commission:branch_commission").eq("canceled", false)),
        range(supabase.from("buy_currencies").select("currency_id, amount, commission")),
        range(supabase.from("sell_currencies").select("currency_id, amount, commission")),
      ]);
      return {
        currencies: cur.data ?? [],
        out: (out_.data ?? []) as TotRow[],
        in: (in_.data ?? []) as TotRow[],
        buy: (buy.data ?? []) as TotRow[],
        sell: (sell.data ?? []) as TotRow[],
      };
    },
  });

  const currencies = data?.currencies ?? [];
  const t = useMemo(
    () => ({
      out: totalsByCurrency(data?.out ?? []),
      in: totalsByCurrency(data?.in ?? []),
      buy: totalsByCurrency(data?.buy ?? []),
      sell: totalsByCurrency(data?.sell ?? []),
    }),
    [data],
  );

  const sections = [
    { key: "out" as const, title: "الحوالات الصادرة", map: t.out },
    { key: "in" as const, title: "الحوالات الواردة", map: t.in },
    { key: "buy" as const, title: "المشتريات", map: t.buy },
    { key: "sell" as const, title: "المبيعات", map: t.sell },
  ];

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="الإجماليات" subtitle="إجمالي الحوالات والبيع والشراء والعمولات لكل عملة، خلال فترة تحددها." />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label="من يوم">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" />
        </Field>
        <Field label="إلى يوم">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ledger-figures" />
        </Field>
      </div>

      {sections.map((s) => (
        <SectionCard key={s.key} title={s.title} aside={`${s.map.size} عملة`}>
          {s.map.size === 0 ? (
            <Notice tone="info" icon={CalendarDays}>لا توجد عمليات في هذه الفترة.</Notice>
          ) : (
            <DataTable head={["العملة", "العدد", "المبلغ", "العمولة"]}>
              {[...s.map.entries()].map(([cid, v]) => (
                <Tr key={cid}>
                  <Td>{currencies.find((c) => c.id === cid)?.currency_name ?? "—"}</Td>
                  <Td money align="center">{fmt(v.count)}</Td>
                  <Td money align="center" className="font-semibold">{fmt(v.amount)}</Td>
                  <Td money align="center">{fmt(v.commission)}</Td>
                </Tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      ))}
    </>
  );
}
