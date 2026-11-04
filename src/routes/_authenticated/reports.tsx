import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { DataTable, LoadingRows, Notice, SectionCard, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { sumByCurrency, trialBalance, type DetailRow } from "@/lib/reports";
import { collectPages } from "@/lib/paginated-read";
import { adenDate } from "@/lib/closing";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "التقارير — ابو طه للصرافة" }, { name: "description", content: "ميزان المراجعة وإجماليات العمليات وأرصدة الصناديق لكل عملة." }, { property: "og:title", content: "التقارير — ابو طه للصرافة" }, { property: "og:description", content: "ميزان المراجعة وإجماليات العمليات وأرصدة الصناديق لكل عملة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsScreen,
});

function ReportsScreen() {
  const today = adenDate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports", today],
    queryFn: async () => {
      const [cur, acc, det, buy, sell, mov] = await Promise.all([
        supabase.from("currencies").select("id, currency_name").order("the_number"),
        collectPages(async (from, until) => { const r = await supabase.from("accounts").select("id, account_number, account_name").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("entries_details").select("account_id, currency_id, side, amount").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("buy_currencies").select("currency_id, amount").eq("the_date", today).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("sell_currencies").select("currency_id, amount").eq("the_date", today).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("box_movements").select("currency_id, amount, movement_type").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
      ]);
      if (cur.error) throw cur.error;
      return {
        currencies: cur.data ?? [],
        accounts: acc,
        details: det as DetailRow[],
        buy,
        sell,
        moves: mov.map((m) => ({ ...m, amount: m.movement_type === "صرف" ? -Number(m.amount) : Number(m.amount) })),
      };
    },
  });

  const currencies = data?.currencies ?? [];
  const cName = (id: number) => currencies.find((c) => c.id === id)?.currency_name ?? "—";
  const trial = useMemo(() => trialBalance(data?.details ?? []), [data]);
  const buy = sumByCurrency(data?.buy ?? []);
  const sell = sumByCurrency(data?.sell ?? []);
  const cash = sumByCurrency(data?.moves ?? []);
  if (isLoading) return <LoadingRows />;
  if (isError) return <Notice tone="danger">تعذّر تحميل التقرير؛ لا يمكن عرض أرصدة موثوقة.</Notice>;

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="التقارير" subtitle="ملخص اليوم، أرصدة الصناديق، وميزان المراجعة لكل عملة." />

      <SectionCard title="حركة اليوم وأرصدة الصناديق" aside="اليوم">
        <DataTable head={["العملة", "مشتريات", "مبيعات", "رصيد الصناديق"]}>
          {currencies.map((c) => (
            <Tr key={c.id}>
              <Td>{c.currency_name}</Td>
              <Td money align="center">{fmt(buy.get(c.id) ?? 0)}</Td>
              <Td money align="center">{fmt(sell.get(c.id) ?? 0)}</Td>
              <Td money align="center" className="font-semibold">{fmt(cash.get(c.id) ?? 0)}</Td>
            </Tr>
          ))}
        </DataTable>
      </SectionCard>

      <SectionCard title="ميزان المراجعة" aside={`${trial.length} حساب`}>
        {trial.length === 0 ? (
          <Notice tone="info">لا توجد قيود بعد. يظهر الميزان بعد إدخال أول قيد يومي.</Notice>
        ) : (
          <DataTable head={["الحساب", "العملة", "مدين", "دائن", "الرصيد"]}>
            {trial.map((t) => {
              const a = data?.accounts.find((x) => x.id === t.account_id);
              return (
                <Tr key={`${t.account_id}-${t.currency_id}`}>
                  <Td className="max-w-[9rem] truncate">{a ? `${a.account_number} ${a.account_name}` : t.account_id}</Td>
                  <Td>{cName(t.currency_id)}</Td>
                  <Td money align="center">{fmt(t.debit)}</Td>
                  <Td money align="center">{fmt(t.credit)}</Td>
                  <Td money align="center" className="font-semibold">{fmt(t.balance)}</Td>
                </Tr>
              );
            })}
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}
