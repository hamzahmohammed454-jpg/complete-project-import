import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Scale } from "lucide-react";

import { SectionIntro } from "@/components/section";
import { EmptyState, Field, LoadingRows } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/box-report")({
  head: () => ({
    meta: [
      { title: "التقرير المالي للصناديق — ابو طه للصرافة" },
      { name: "description", content: "تفاصيل الحوالات والحركات لكل صندوق وعملة مع ميزان كل صندوق." },
      { property: "og:title", content: "التقرير المالي للصناديق — ابو طه للصرافة" },
      { property: "og:description", content: "ميزان الصناديق حسب العملة وتفاصيل الحوالات." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoxReport,
});

type Mv = {
  box_id: number; currency_id: number | null; amount: number | string; movement_type: string;
  source_type: string | null; notes: string | null; created_at: string;
  boxes: { box_name: string } | null; currencies: { currency_name: string } | null;
};

const SOURCE_LABEL: Record<string, string> = {
  outgoing_transfers: "حوالات صادرة", incoming_transfers: "حوالات واردة",
  cash_vouchers: "سندات", buy_currencies: "شراء عملات", sell_currencies: "بيع عملات",
  agent_settlements: "تسويات وكلاء", checks: "شيكات",
};

function BoxReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);

  const { data = [], isLoading } = useQuery({
    queryKey: ["box-report", from, to],
    queryFn: async () => {
      const rows: Mv[] = [];
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("box_movements")
          .select("box_id, currency_id, amount, movement_type, source_type, notes, created_at, boxes(box_name), currencies!currency_id(currency_name)")
          .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`)
          .order("id").range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        rows.push(...(data as unknown as Mv[]));
        if (data.length < 1000) break;
      }
      return rows;
    },
  });

  // box -> currency -> { in, out, bySource }
  const boxes = new Map<string, Map<string, { inn: number; out: number; src: Map<string, { inn: number; out: number; n: number }> }>>();
  for (const m of data) {
    const b = m.boxes?.box_name ?? `صندوق ${m.box_id}`;
    const c = m.currencies?.currency_name ?? "—";
    const amt = Number(m.amount);
    const isIn = m.movement_type === "قبض";
    const bm = boxes.get(b) ?? new Map(); boxes.set(b, bm);
    const cm = bm.get(c) ?? { inn: 0, out: 0, src: new Map() }; bm.set(c, cm);
    if (isIn) cm.inn += amt; else cm.out += amt;
    const key = m.source_type ? SOURCE_LABEL[m.source_type] ?? m.source_type : (m.notes === "رصيد افتتاحي" ? "رصيد افتتاحي" : "حركات يدوية");
    const s = cm.src.get(key) ?? { inn: 0, out: 0, n: 0 }; cm.src.set(key, s);
    if (isIn) s.inn += amt; else s.out += amt; s.n++;
  }

  return (
    <>
      <SectionIntro title="التقرير المالي للصناديق" subtitle="تفاصيل الحوالات وبقية الحركات لكل صندوق وعملة، مع الميزان (الوارد − الصادر)." />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="من"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {isLoading ? <LoadingRows rows={3} /> : boxes.size === 0 ? (
        <EmptyState icon={Scale} title="لا توجد حركات في هذه الفترة" hint="غيّر التاريخ أو سجّل أرصدة افتتاحية وحوالات." />
      ) : (
        <div className="space-y-3">
          {[...boxes].map(([box, cur]) => (
            <section key={box} className="rounded-2xl border bg-card p-3">
              <h2 className="mb-2 text-base font-bold">{box}</h2>
              {[...cur].map(([c, v]) => (
                <div key={c} className="mb-2 rounded-xl bg-muted/50 p-2 last:mb-0">
                  <div className="mb-1 flex justify-between text-sm font-bold">
                    <span>{c}</span>
                    <span className="ledger-figures">الميزان: {fmt(v.inn - v.out)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground"><tr><th className="text-start">البند</th><th>العدد</th><th>وارد</th><th>صادر</th></tr></thead>
                    <tbody className="ledger-figures">
                      {[...v.src].map(([k, s]) => (
                        <tr key={k}><td>{k}</td><td className="text-center">{s.n}</td><td className="text-center">{fmt(s.inn)}</td><td className="text-center">{fmt(s.out)}</td></tr>
                      ))}
                      <tr className="border-t font-bold"><td>الإجمالي</td><td /><td className="text-center">{fmt(v.inn)}</td><td className="text-center">{fmt(v.out)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
