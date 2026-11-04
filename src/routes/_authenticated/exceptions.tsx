import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Input } from "@/components/ui/input";
import { DataTable, Field, Notice, SectionCard, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { agentReconciliation, staleTransfers, type OpenTransfer } from "@/lib/exceptions";

const T = "الاستثناءات ومطابقة الوكلاء — الصرافة";
const D = "الحوالات المتأخرة التي تحتاج متابعة، وملخص الحوالات المفتوحة لكل وكيل لمطابقته مع كشفه.";
export const Route = createFileRoute("/_authenticated/exceptions")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ExceptionsScreen,
});

const COLS = "id, the_date, amount, currency_id, agent_id, transfer_number, receiver_name";

async function openRows(table: "outgoing_transfers" | "incoming_transfers", dir: "out" | "in") {
  const rows: OpenTransfer[] = [];
  for (let p = 0; p < 100; p++) {
    let q = supabase.from(table).select(COLS).eq("canceled", false).eq("delivered", false);
    if (table === "outgoing_transfers") q = (q as any).eq("is_internal", false);
    const { data, error } = await q.order("id").range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Omit<OpenTransfer, "dir">[]).map((r) => ({ ...r, dir })));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

function ExceptionsScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [maxDays, setMaxDays] = useState(3);
  const { data, isLoading, error } = useQuery({
    queryKey: ["exceptions"],
    queryFn: async () => {
      const [out, inn, cur, ag] = await Promise.all([
        openRows("outgoing_transfers", "out"),
        openRows("incoming_transfers", "in"),
        supabase.from("currencies").select("id, currency_name"),
        supabase.from("agents").select("id, agent_name"),
      ]);
      return { rows: [...out, ...inn], currencies: cur.data ?? [], agents: ag.data ?? [] };
    },
  });
  const cur = (id: number | null) => data?.currencies.find((c) => c.id === id)?.currency_name ?? "—";
  const agent = (id: number | null) => (id == null ? "—" : data?.agents.find((a) => a.id === id)?.agent_name ?? `وكيل ${id}`);
  const stale = staleTransfers(data?.rows ?? [], today, maxDays);
  const recon = agentReconciliation(data?.rows ?? []);

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="الاستثناءات ومطابقة الوكلاء" subtitle="ما يحتاج متابعة اليوم، وما هو مفتوح عند كل وكيل. الشاشة للعرض فقط." />
      {error ? <Notice tone="danger">تعذّر تحميل البيانات.</Notice> : null}
      <SectionCard title={`حوالات متأخرة (${stale.length})`}>
        <Field label="اعتبرها متأخرة بعد (أيام)">
          <Input type="number" min={0} value={maxDays} onChange={(e) => setMaxDays(Math.max(0, Number(e.target.value) || 0))} className="w-28" />
        </Field>
        {isLoading ? <Notice>جارٍ التحميل…</Notice> : stale.length === 0 ? <Notice tone="success">لا توجد حوالات متأخرة.</Notice> : (
          <DataTable head={["النوع", "الرقم", "التاريخ", "الأيام", "المبلغ", "العملة", "الوكيل", "المستلم"]}>
            {stale.map((r) => (
              <Tr key={`${r.dir}${r.id}`}>
                <Td>{r.dir === "out" ? "صادرة لم تُسلَّم" : "واردة لم تُصرف"}</Td>
                <Td className="ledger-figures">{r.transfer_number ?? r.id}</Td>
                <Td className="ledger-figures">{r.the_date}</Td>
                <Td className="ledger-figures font-bold text-destructive">{r.age}</Td>
                <Td className="ledger-figures">{fmt(r.amount)}</Td>
                <Td>{cur(r.currency_id)}</Td>
                <Td>{agent(r.agent_id)}</Td>
                <Td>{r.receiver_name ?? "—"}</Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </SectionCard>
      <SectionCard title="مطابقة الوكلاء — الحوالات المفتوحة">
        <Notice>قارن هذه الأرقام مع كشف كل وكيل؛ أي اختلاف يعني حوالة ناقصة أو زائدة عند أحد الطرفين.</Notice>
        {recon.length === 0 && !isLoading ? <Notice tone="success">لا توجد حوالات مفتوحة عند الوكلاء.</Notice> : (
          <DataTable head={["الوكيل", "العملة", "صادرة مفتوحة", "مبلغها", "واردة مفتوحة", "مبلغها"]}>
            {recon.map((l) => (
              <Tr key={`${l.agentId}:${l.currencyId}`}>
                <Td>{agent(l.agentId)}</Td>
                <Td>{cur(l.currencyId)}</Td>
                <Td className="ledger-figures">{l.outCount}</Td>
                <Td className="ledger-figures">{fmt(l.outAmount)}</Td>
                <Td className="ledger-figures">{l.inCount}</Td>
                <Td className="ledger-figures">{fmt(l.inAmount)}</Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}
