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
import { fmt } from "@/lib/money";
import { collectPages } from "@/lib/paginated-read";
import { blacklistMatch, type BlacklistRow } from "@/lib/transfer-setup";
import { ageDays, dateDiffers, duplicateGroups, missingNumbers, totalsBy, type ReportRow } from "@/lib/transfer-reports";

type Dir = "outgoing" | "incoming";
type Kind = "list" | "paid" | "age" | "gaps" | "search" | "date-diff" | "dupes" | "blacklist" | "canceled" | "customers" | "totals" | "totals-daily";
type Report = { title: string; dirs: Dir[]; kind: Kind; back: string };

/** كل تقرير يُفتح من أيقونته في قسم الحوالات عبر ?r= */
export const TRANSFER_REPORTS = {
  all: { title: "تقارير الحوالات", dirs: ["outgoing", "incoming"], kind: "list", back: "transfers-reports" },
  "out-list": { title: "الكشوفات الصادرة", dirs: ["outgoing"], kind: "list", back: "transfers-ops" },
  "in-list": { title: "الكشوفات الواردة", dirs: ["incoming"], kind: "list", back: "transfers-ops" },
  paid: { title: "تقرير تأكيد صرف الحوالات", dirs: ["incoming"], kind: "paid", back: "transfers-reports" },
  age: { title: "تقرير عمر الحوالات الصادرة والمصروفة", dirs: ["outgoing", "incoming"], kind: "age", back: "transfers-reports" },
  gaps: { title: "تقرير أرقام الحوالات الناقصة", dirs: ["outgoing", "incoming"], kind: "gaps", back: "transfers-reports" },
  search: { title: "البحث عن الحوالات", dirs: ["outgoing", "incoming"], kind: "search", back: "transfers-reports" },
  "date-diff": { title: "تقرير اختلاف تاريخ الحوالات", dirs: ["outgoing", "incoming"], kind: "date-diff", back: "transfers-reports" },
  dupes: { title: "تقرير الحوالات المكررة", dirs: ["outgoing", "incoming"], kind: "dupes", back: "transfers-reports" },
  blacklist: { title: "تقرير الحوالات في القائمة السوداء", dirs: ["outgoing", "incoming"], kind: "blacklist", back: "transfers-reports" },
  canceled: { title: "تقرير الحوالات الملغية", dirs: ["outgoing", "incoming"], kind: "canceled", back: "transfers-reports" },
  customers: { title: "تقرير حوالات العملاء", dirs: ["outgoing", "incoming"], kind: "customers", back: "transfers-reports" },
  "totals-in": { title: "إجماليات الوارد", dirs: ["incoming"], kind: "totals", back: "transfers-totals" },
  "totals-out": { title: "إجماليات الصادر", dirs: ["outgoing"], kind: "totals", back: "transfers-totals" },
  "totals-in-daily": { title: "تقارير إجماليات الوارد", dirs: ["incoming"], kind: "totals-daily", back: "transfers-totals" },
  "totals-out-daily": { title: "تقارير إجماليات الصادر", dirs: ["outgoing"], kind: "totals-daily", back: "transfers-totals" },
} satisfies Record<string, Report>;
type ReportId = keyof typeof TRANSFER_REPORTS;

export const Route = createFileRoute("/_authenticated/transfer-reports")({
  validateSearch: (s: Record<string, unknown>): { r: ReportId } => ({ r: typeof s["r"] === "string" && s["r"] in TRANSFER_REPORTS ? (s["r"] as ReportId) : "all" }),
  head: () => ({ meta: [{ title: "تقارير الحوالات — ابو طه للصرافة" }, { name: "description", content: "كشوفات وإجماليات وتقارير الحوالات الصادرة والواردة." }, { property: "og:title", content: "تقارير الحوالات — ابو طه للصرافة" }, { property: "og:description", content: "كشوفات وإجماليات وتقارير الحوالات الصادرة والواردة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TransferReportsScreen,
});

type Row = ReportRow & { sender_phone: string | null; receiver_phone: string | null; customer_id: number | null; agent_id: number | null; reference_number: string | null; transfer_number: number | null; receiver_identity_number: string | null };

const BASE = "id, document_number, transfer_number, reference_number, the_date, created_at, amount, currency_id, sender_name, sender_phone, receiver_name, receiver_phone, receiver_identity_number, delivered, canceled, customer_id, agent_id";

function monthStart() { return `${adenDate().slice(0, 8)}01`; }

function TransferReportsScreen() {
  const { r } = Route.useSearch();
  const rep: Report = TRANSFER_REPORTS[r];
  const isSearch = rep.kind === "search";
  const [from, setFrom] = useState(isSearch ? "" : monthStart());
  const [until, setUntil] = useState(adenDate());
  const [text, setText] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["transfer-reports", rep.dirs.join(","), from, until],
    queryFn: async () => {
      const load = (dir: Dir) => collectPages<Row>(async (a, b) => {
        let q = supabase.from(dir === "outgoing" ? "outgoing_transfers" : "incoming_transfers").select(dir === "incoming" ? `${BASE}, delivered_at` : BASE) as any;
        if (from) q = q.gte("the_date", from);
        if (until) q = q.lte("the_date", until);
        const { data, error } = await q.order("the_date", { ascending: false }).order("id", { ascending: false }).range(a, b);
        if (error) throw error;
        return (data ?? []).map((x: Row) => ({ ...x, dir }));
      });
      const [rows, cur, agents, customers, blacklist] = await Promise.all([
        Promise.all(rep.dirs.map(load)).then((l) => l.flat()),
        supabase.from("currencies").select("id, currency_name").order("the_number"),
        supabase.from("agents").select("id, agent_name"),
        supabase.from("customers").select("id, full_name"),
        supabase.from("blacklist").select("full_name, identity_number, phone_number, reason"),
      ]);
      return { rows, currencies: cur.data ?? [], agents: agents.data ?? [], customers: customers.data ?? [], blacklist: (blacklist.data ?? []) as BlacklistRow[] };
    },
  });

  const curName = (id: number | null) => data?.currencies.find((c) => c.id === id)?.currency_name ?? "—";
  const custName = (id: number | null) => data?.customers.find((c) => c.id === id)?.full_name ?? "—";
  const agentName = (id: number | null) => data?.agents.find((c) => c.id === id)?.agent_name ?? "";

  const view = useMemo(() => {
    const all = data?.rows ?? [];
    const bl = data?.blacklist ?? [];
    const blHit = (t: Row) => blacklistMatch(t.sender_name, t.sender_phone ?? "", "", bl) ?? blacklistMatch(t.receiver_name, t.receiver_phone ?? "", t.receiver_identity_number ?? "", bl);
    switch (rep.kind) {
      case "paid": return all.filter((t) => t.delivered && !t.canceled);
      case "age": return all.filter((t) => !t.canceled).sort((a, b) => ageDays(b) - ageDays(a));
      case "date-diff": return all.filter(dateDiffers);
      case "dupes": return duplicateGroups(all).flat();
      case "blacklist": return all.filter((t) => blHit(t));
      case "canceled": return all.filter((t) => t.canceled);
      case "customers": return all.filter((t) => t.customer_id != null).sort((a, b) => custName(a.customer_id).localeCompare(custName(b.customer_id)));
      case "search": {
        const s = text.trim();
        if (!s) return [];
        return all.filter((t) => `${documentNumber(t.dir, t.document_number)} ${t.transfer_number ?? ""} ${t.reference_number ?? ""} ${t.sender_name} ${t.receiver_name} ${t.sender_phone ?? ""} ${t.receiver_phone ?? ""} ${t.receiver_identity_number ?? ""} ${t.amount}`.includes(s));
      }
      default: return all;
    }
  }, [data, rep.kind, text]);

  const extraHead = rep.kind === "age" ? "العمر (يوم)" : rep.kind === "paid" ? "تاريخ الصرف" : rep.kind === "date-diff" ? "يوم الإدخال" : rep.kind === "customers" ? "العميل" : rep.kind === "blacklist" ? "سبب القائمة" : "الوكيل";
  const extra = (t: Row) => {
    if (rep.kind === "age") return fmt(ageDays(t), 0);
    if (rep.kind === "paid") return t.delivered_at ? adenDate(t.delivered_at) : "—";
    if (rep.kind === "date-diff") return adenDate(t.created_at);
    if (rep.kind === "customers") return custName(t.customer_id);
    if (rep.kind === "blacklist") {
      const bl = data?.blacklist ?? [];
      return (blacklistMatch(t.sender_name, t.sender_phone ?? "", "", bl) ?? blacklistMatch(t.receiver_name, t.receiver_phone ?? "", t.receiver_identity_number ?? "", bl))?.reason ?? "مطابقة";
    }
    return agentName(t.agent_id) || "—";
  };

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
        {isSearch && <Field label="ابحث" className="col-span-2"><Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="رقم الحوالة أو المرجع أو الاسم أو الهاتف أو الهوية" /></Field>}
      </div>

      {error && <Notice tone="danger">تعذّر تحميل التقرير. تأكد من الاتصال وحاول مرة أخرى.</Notice>}
      {isLoading ? <LoadingRows /> : rep.kind === "gaps" ? (
        <GapsView rows={data?.rows ?? []} dirs={rep.dirs} />
      ) : rep.kind === "totals" || rep.kind === "totals-daily" ? (
        <TotalsView rows={view} byDay={rep.kind === "totals-daily"} curName={curName} />
      ) : (
        <>
          <SectionCard title="الحوالات" aside={`${fmt(view.length, 0)} حوالة`}>
            {view.length === 0 ? (
              <Notice tone="info" icon={CalendarDays}>{isSearch && !text.trim() ? "اكتب ما تبحث عنه في خانة البحث." : "لا توجد حوالات في هذه الفترة."}</Notice>
            ) : (
              <DataTable head={["رقم السند", "التاريخ", ...(rep.dirs.length > 1 ? ["النوع"] : []), "المرسل", "المستلم", "المبلغ", "العملة", "الحالة", extraHead]}>
                {view.map((t) => (
                  <Tr key={`${t.dir}-${t.id}`}>
                    <Td money className="whitespace-nowrap font-semibold text-primary">{documentNumber(t.dir, t.document_number)}</Td>
                    <Td money className="whitespace-nowrap">{t.the_date}</Td>
                    {rep.dirs.length > 1 && <Td>{t.dir === "outgoing" ? "صادرة" : "واردة"}</Td>}
                    <Td>{t.sender_name}</Td>
                    <Td>{t.receiver_name}</Td>
                    <Td money align="end" className="font-semibold">{fmt(t.amount)}</Td>
                    <Td>{curName(t.currency_id)}</Td>
                    <Td><StatusPill tone={t.canceled ? "bad" : t.delivered ? "ok" : "warn"}>{t.canceled ? "ملغاة" : t.delivered ? "مسلّمة" : "معلقة"}</StatusPill></Td>
                    <Td money={rep.kind === "age" || rep.kind === "paid" || rep.kind === "date-diff"}>{extra(t)}</Td>
                  </Tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
          {view.length > 0 && rep.kind !== "canceled" && <TotalsView rows={view} byDay={false} curName={curName} />}
        </>
      )}
    </>
  );
}

function TotalsView({ rows, byDay, curName }: { rows: readonly ReportRow[]; byDay: boolean; curName: (id: number | null) => string }) {
  const totals = totalsBy(rows, byDay);
  return (
    <SectionCard title={byDay ? "الإجماليات اليومية لكل عملة" : "الإجمالي لكل عملة"} aside="بدون الملغاة">
      {totals.length === 0 ? <Notice tone="info" icon={CalendarDays}>لا توجد حوالات في هذه الفترة.</Notice> : (
        <DataTable head={[...(byDay ? ["اليوم"] : []), "العملة", "العدد", "المبلغ"]}>
          {totals.map((t) => (
            <Tr key={`${t.day}-${t.currency_id}`}>
              {byDay && <Td money className="whitespace-nowrap">{t.day}</Td>}
              <Td>{curName(t.currency_id)}</Td>
              <Td money align="center">{fmt(t.count, 0)}</Td>
              <Td money align="end" className="font-semibold">{fmt(t.amount)}</Td>
            </Tr>
          ))}
        </DataTable>
      )}
    </SectionCard>
  );
}

function GapsView({ rows, dirs }: { rows: readonly ReportRow[]; dirs: Dir[] }) {
  return (
    <>
      {dirs.map((d) => {
        const gaps = missingNumbers(rows.filter((t) => t.dir === d).map((t) => t.document_number));
        return (
          <SectionCard key={d} title={d === "outgoing" ? "الحوالات الصادرة" : "الحوالات الواردة"} aside={`${fmt(gaps.length, 0)} رقم ناقص`}>
            {gaps.length === 0 ? <Notice tone="success">لا توجد أرقام ناقصة في هذه الفترة.</Notice> : (
              <div className="flex flex-wrap gap-1.5">
                {gaps.map((n) => <span key={n} className="ledger-figures rounded-md border border-border bg-muted px-2 py-1 text-xs">{documentNumber(d, n)}</span>)}
              </div>
            )}
          </SectionCard>
        );
      })}
    </>
  );
}
