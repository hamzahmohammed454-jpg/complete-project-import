import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { DataTable, Notice, SectionCard, Td, Tr } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { cashPosition, type CashMv, type PendingIn } from "@/lib/cash-position";

const T = "وضع الصرافة الآن — الصرافة";
const D = "السيولة في الصناديق لكل عملة مقابل الحوالات الواردة المنتظرة للصرف، مع تنبيه النقص.";
export const Route = createFileRoute("/_authenticated/cash-position")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CashPositionScreen,
});

async function pageAll<R>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: R[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await q(p * 1000, p * 1000 + 999);
    if (error) throw error;
    const d = (data ?? []) as R[];
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

function CashPositionScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cash-position"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [cur, moves, pending, outToday, inToday] = await Promise.all([
        supabase.from("currencies").select("id, currency_name").order("the_number"),
        pageAll<CashMv>((a, b) => supabase.from("box_movements").select("currency_id, amount, movement_type").order("id").range(a, b)),
        pageAll<PendingIn>((a, b) => supabase.from("incoming_transfers").select("currency_id, amount").eq("canceled", false).eq("delivered", false).order("id").range(a, b)),
        supabase.from("outgoing_transfers").select("id", { count: "exact", head: true }).eq("the_date", today).eq("canceled", false),
        supabase.from("incoming_transfers").select("id", { count: "exact", head: true }).eq("delivered", true).gte("delivered_at", `${today}T00:00:00`),
      ]);
      return { currencies: cur.data ?? [], rows: cashPosition(moves, pending), outToday: outToday.count ?? 0, inToday: inToday.count ?? 0 };
    },
  });

  const name = (id: number) => data?.currencies.find((c) => c.id === id)?.currency_name ?? "—";
  const shorts = data?.rows.filter((r) => r.short) ?? [];

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="وضع الصرافة الآن" subtitle="نظرة فورية: كم نقد في الصناديق، وكم علينا من حوالات واردة لم تُصرف بعد، لكل عملة على حدة. تتحدّث كل دقيقة." />
      {error ? <Notice tone="danger">تعذّر تحميل البيانات.</Notice> : null}
      {shorts.length > 0 ? (
        <Notice tone="danger">تنبيه نقص سيولة في: {shorts.map((s) => name(s.currencyId)).join("، ")} — النقد أقل من الحوالات المنتظرة للصرف.</Notice>
      ) : null}
      <SectionCard title="اليوم">
        <div className="ledger-figures grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg border p-3"><div className="text-sm text-muted-foreground">حوالات صادرة اليوم</div><div className="text-2xl font-bold">{data?.outToday ?? "…"}</div></div>
          <div className="rounded-lg border p-3"><div className="text-sm text-muted-foreground">حوالات صُرفت اليوم</div><div className="text-2xl font-bold">{data?.inToday ?? "…"}</div></div>
        </div>
      </SectionCard>
      <SectionCard title="السيولة لكل عملة">
        {isLoading ? <Notice>جارٍ التحميل…</Notice> : (
          <DataTable head={["العملة", "النقد في الصناديق", "حوالات منتظرة الصرف", "العدد", "المتبقي بعد الصرف"]}>
            {(data?.rows ?? []).map((r) => (
              <Tr key={r.currencyId}>
                <Td>{name(r.currencyId)}</Td>
                <Td className="ledger-figures">{fmt(r.cash)}</Td>
                <Td className="ledger-figures">{fmt(r.pending)}</Td>
                <Td className="ledger-figures">{r.pendingCount}</Td>
                <Td className={`ledger-figures font-bold ${r.short ? "text-destructive" : ""}`}>{fmt(r.after)}</Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}
