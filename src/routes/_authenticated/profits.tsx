import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, EmptyState, Field, LoadingRows, SectionCard, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { downloadBlob } from "@/lib/download";
import { fmt } from "@/lib/money";
import { commissionByAgent, exchangeSpreads, profitByCurrency, type AgentCommissionRow, type ProfitRow, type ExchangeSpreadRow } from "@/lib/profits";
import { collectPages } from "@/lib/paginated-read";
import { profitsFilename, profitsToArrayBuffer } from "@/lib/profits-xlsx";
import { xlsxBlob } from "@/lib/statement-xlsx";

export const Route = createFileRoute("/_authenticated/profits")({
  head: () => ({ meta: [{ title: "الأرباح — ابو طه للصرافة" }, { name: "description", content: "تقارير عمولات العمليات والعملات والوكلاء خلال الفترة المحددة." }, { property: "og:title", content: "الأرباح — ابو طه للصرافة" }, { property: "og:description", content: "تقارير عمولات العمليات والعملات والوكلاء خلال الفترة المحددة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ProfitsScreen,
});

function ProfitsScreen() {
  const today = adenDate();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState(today);

  const currencies = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, agent_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const exchange = useQuery({
    queryKey: ["profits_exchange"],
    queryFn: async () => {
      const cols = "currency_id, exchange_currency_id, exchange_amount, amount, commission, the_date";
      const [buy, sell] = await Promise.all([
        collectPages(async (from, until) => { const r = await supabase.from("buy_currencies").select(cols).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("sell_currencies").select(cols).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
      ]);
      return [...buy.map((r) => ({ ...r, kind: "buy" as const })), ...sell.map((r) => ({ ...r, kind: "sell" as const }))] as ExchangeSpreadRow[];
    },
  });
  const transfers = useQuery({
    queryKey: ["profits_transfers"],
    queryFn: async () => {
      const cols = "agent_id, currency_id, commission_currency_id, branch_commission, amount, the_date, canceled";
      const [out_, in_] = await Promise.all([
        collectPages(async (from, until) => { const r = await supabase.from("outgoing_transfers").select(cols).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
        collectPages(async (from, until) => { const r = await supabase.from("incoming_transfers").select(cols).is("internal_outgoing_id", null).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
      ]);
      // عمولة الحوالة بعملة العمولة إن حُددت وإلا بعملة الحوالة
      return [...out_, ...in_].map((t) => ({
        agent_id: t.agent_id,
        currency_id: t.commission_currency_id ?? t.currency_id,
        amount: t.amount,
        commission: t.branch_commission,
        the_date: t.the_date,
        canceled: t.canceled,
      })) as (ProfitRow & AgentCommissionRow)[];
    },
  });

  const from_ = from || null;
  const until_ = until || null;
  const curName = (id: number) => currencies.data?.find((c) => c.id === id)?.currency_name ?? "—";
  const agentName = (id: number) => agents.data?.find((a) => a.id === id)?.agent_name ?? "—";

  const exchangeRows = useMemo(() => {
    const map = profitByCurrency((exchange.data ?? []).map((r) => ({ ...r, currency_id: r.exchange_currency_id, amount: Number(r.exchange_amount) })), from_, until_);
    return [...map.entries()]
      .map(([cur, p]) => ({ currency: curName(cur), ...p }))
      .filter((r) => r.count > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange.data, from_, until_, currencies.data]);
  const spreads = exchangeSpreads(exchange.data ?? [], from_, until_).map((r) => ({ ...r, pair: `${curName(r.currency_id)} / ${curName(r.exchange_currency_id)}` }));

  const transferRows = useMemo(() => {
    const map = profitByCurrency(transfers.data ?? [], from_, until_);
    return [...map.entries()]
      .map(([cur, p]) => ({ currency: curName(cur), ...p }))
      .filter((r) => r.count > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers.data, from_, until_, currencies.data]);

  const agentRows = useMemo(() => {
    const map = commissionByAgent(transfers.data ?? [], from_, until_);
    const out: { agent: string; currency: string; commission: number }[] = [];
    for (const [agentId, byCur] of map) {
      for (const [cur, commission] of byCur) {
        if (commission !== 0) out.push({ agent: agentName(agentId), currency: curName(cur), commission });
      }
    }
    return out.sort((a, b) => a.agent.localeCompare(b.agent, "ar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers.data, from_, until_, agents.data, currencies.data]);

  const loading = exchange.isLoading || transfers.isLoading;
  const empty = !loading && exchangeRows.length === 0 && transferRows.length === 0;

  const exportExcel = () => {
    const period = `${from ? `من ${from} ` : ""}حتى ${until || today}`;
    const buf = profitsToArrayBuffer({ period, exchange: exchangeRows, transfers: transferRows, agents: agentRows, spreads });
    downloadBlob(xlsxBlob(buf), profitsFilename(until || today));
    toast.success("نُزّل تقرير الأرباح");
  };

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro
        title="الأرباح"
        subtitle="عمولات العمليات وفوارق أسعار العملات"
      />

      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {([["يومي", 0], ["أسبوعي", 6], ["شهري", "m"], ["سنوي", "y"]] as const).map(([label, back]) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const t = adenDate();
              const start = back === "m" ? `${t.slice(0, 7)}-01` : back === "y" ? `${t.slice(0, 4)}-01-01` : new Date(new Date(`${t}T00:00:00Z`).getTime() - back * 86400000).toISOString().slice(0, 10);
              setFrom(start);
              setUntil(t);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label="من يوم">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" />
        </Field>
        <Field label="حتى يوم">
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="ledger-figures" />
        </Field>
      </div>

      {loading ? (
        <LoadingRows rows={3} />
      ) : empty ? (
        <EmptyState
          icon={TrendingUp}
          title="لا أرباح في هذه الفترة"
          hint="لا توجد عمليات بيع أو شراء أو حوالات بعمولات ضمن الفترة المحددة."
        />
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="size-4" />
              تنزيل Excel
            </Button>
          </div>

          {exchangeRows.length > 0 && (
            <SectionCard title="عمولات البيع والشراء (بعملة القيمة)">
              <DataTable head={["العملة", "العمليات", "المبالغ", "العمولات"]}>
                {exchangeRows.map((r) => (
                  <Tr key={r.currency}>
                    <Td>{r.currency}</Td>
                    <Td money align="center">{fmt(r.count)}</Td>
                    <Td money align="end">{fmt(r.amount)}</Td>
                    <Td money align="end">
                      <span className="font-semibold text-positive">{fmt(r.commission)}</span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </SectionCard>
          )}

          {spreads.length > 0 && <SectionCard title="فوارق البيع والشراء">
            <DataTable head={["زوج العملات", "كمية الشراء", "كمية البيع", "متوسط الشراء", "متوسط البيع", "فارق السعر", "فارق تقديري بعملة القيمة"]}>
              {spreads.map((r) => <Tr key={`${r.currency_id}:${r.exchange_currency_id}`}><Td>{r.pair}</Td><Td money>{fmt(r.buyAmount)}</Td><Td money>{fmt(r.sellAmount)}</Td><Td money>{r.buyRate == null ? "—" : fmt(r.buyRate)}</Td><Td money>{r.sellRate == null ? "—" : fmt(r.sellRate)}</Td><Td money>{r.rateDifference == null ? "—" : fmt(r.rateDifference)}</Td><Td money>{r.indicativeSpread == null ? "—" : fmt(r.indicativeSpread)}</Td></Tr>)}
            </DataTable>
            <p className="mt-2 text-xs text-muted-foreground">الفارق تقديري على الكمية المشتركة بين البيع والشراء؛ ليس ربحاً محققاً ولا قيداً مالياً، ولا يشمل العمولات.</p>
          </SectionCard>}

          {transferRows.length > 0 && (
            <SectionCard title="عمولات الحوالات">
              <DataTable head={["العملة", "الحوالات", "المبالغ", "العمولات"]}>
                {transferRows.map((r) => (
                  <Tr key={r.currency}>
                    <Td>{r.currency}</Td>
                    <Td money align="center">{fmt(r.count)}</Td>
                    <Td money align="end">{fmt(r.amount)}</Td>
                    <Td money align="end">
                      <span className="font-semibold text-positive">{fmt(r.commission)}</span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </SectionCard>
          )}

          {agentRows.length > 0 && (
            <SectionCard title="عمولات الوكلاء">
              <DataTable head={["الوكيل", "العملة", "العمولة"]}>
                {agentRows.map((r, i) => (
                  <Tr key={`${r.agent}|${r.currency}|${i}`}>
                    <Td>{r.agent}</Td>
                    <Td>{r.currency}</Td>
                    <Td money align="end">
                      <span className="font-semibold text-positive">{fmt(r.commission)}</span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </SectionCard>
          )}
        </>
      )}
    </>
  );
}
