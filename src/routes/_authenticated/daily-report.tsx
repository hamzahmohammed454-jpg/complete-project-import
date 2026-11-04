import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Printer, Download } from "lucide-react";
import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Field, Notice, Td, Tr, selectCls } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { fmt } from "@/lib/money";
import type { DailyReport } from "@/lib/management-reports";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { tablesToWorkbook } from "@/lib/backup";
import { downloadBlob } from "@/lib/download";
import { xlsxBlob } from "@/lib/statement-xlsx";

const options = (date: string, branch: string) => queryOptions({ queryKey: ["daily-report", date, branch], queryFn: async () => {
  const { data, error } = await supabase.rpc("daily_operations_report", { p_date: date, ...(branch ? { p_branch: Number(branch) } : {}) });
  if (error) throw error;
  return data as unknown as DailyReport;
} });

export const Route = createFileRoute("/_authenticated/daily-report")({
  head: () => ({ meta: [{ title: "التقرير اليومي — ابو طه للصرافة" }, { name: "description", content: "حركات اليوم وعمولات الصرافة والحوالات وأرصدة الخزينة حسب العملة والفرع." }, { property: "og:title", content: "التقرير اليومي — ابو طه للصرافة" }, { property: "og:description", content: "أرصدة وعمولات وحركات الموظفين في اليوم المحدد." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DailyScreen,
});

function DailyScreen() {
  const [date, setDate] = useState(adenDate());
  const [branch, setBranch] = useState("");
  const { isManager, isLoading } = useAppRoles();
  const currencies = useQuery({ queryKey: ["currencies"], queryFn: async () => { const { data, error } = await supabase.from("currencies").select("id,currency_name").order("the_number"); if (error) throw error; return data; } });
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => { const { data, error } = await supabase.from("branches").select("id,branch_name"); if (error) throw error; return data; } });
  return <><MenuStrip tab="/reports" /><SectionIntro title="التقرير اليومي" subtitle="العمولات وحركة الخزينة" />
    <div className="mb-6 grid gap-3 sm:grid-cols-2"><Field label="اليوم"><Input type="date" required value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /></Field><Field label="الفرع"><select className={selectCls} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">كل الفروع</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}</select></Field></div>
    {!isLoading && !isManager ? <Notice>التقرير اليومي متاح للمدير فقط.</Notice> : !isLoading && <DailyRows date={date} branch={branch} currencyName={(id) => currencies.data?.find((c) => c.id === id)?.currency_name ?? String(id)} />}
  </>;
}

function DailyRows({ date, branch, currencyName }: { date: string; branch: string; currencyName: (id: number) => string }) {
  const { data } = useSuspenseQuery(options(date, branch));
  const permissions = useScreenPermissions("/daily-report");
  return <>
    {permissions.can("print") && <div className="mb-5 flex justify-end gap-2 print:hidden"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />طباعة</Button>{permissions.can("excel") && <Button variant="outline" size="sm" onClick={() => downloadBlob(xlsxBlob(tablesToWorkbook([{ name: "حركة اليوم", rows: data.volume }, { name: "العمولات", rows: data.commissions }, { name: "الصناديق", rows: data.cash }, { name: "الموظفون", rows: data.staff }])), `تقرير يومي-${date}.xlsx`)}><Download className="size-4" />Excel</Button>}</div>}
    <ReportBand title="حركة اليوم"><DataTable head={["العملية", "العملة", "العدد", "المبلغ"]}>{data.volume.map((r) => <Tr key={`${r.kind}-${r.currency_id}`}><Td>{r.kind}</Td><Td>{currencyName(r.currency_id)}</Td><Td money>{fmt(r.count)}</Td><Td money>{fmt(r.amount)}</Td></Tr>)}</DataTable>{!data.volume.length && <Notice>لا توجد عمليات في اليوم المحدد.</Notice>}</ReportBand>
    <ReportBand title="العمولات المسجلة"><DataTable head={["عملة العمولة", "الإجمالي"]}>{data.commissions.map((r) => <Tr key={r.currency_id}><Td>{currencyName(r.currency_id)}</Td><Td money>{fmt(r.amount)}</Td></Tr>)}</DataTable><p className="mt-2 text-xs text-muted-foreground">العمولات لا تشمل فروقات تقييم العملات أو المصروفات.</p></ReportBand>
    <ReportBand title="أرصدة الصناديق"><DataTable head={["الصندوق", "العملة", "افتتاحي", "قبض", "صرف", "ختامي"]}>{data.cash.map((r) => <Tr key={`${r.box_id}-${r.currency_id}`}><Td>{r.box_name ?? r.box_id}</Td><Td>{currencyName(r.currency_id)}</Td><Td money>{fmt(r.opening)}</Td><Td money>{fmt(r.receipts)}</Td><Td money>{fmt(r.payments)}</Td><Td money>{fmt(r.closing)}</Td></Tr>)}</DataTable></ReportBand>
    <ReportBand title="مركز العملات النقدي"><DataTable head={["العملة", "صافي الصناديق"]}>{data.positions.map((r) => <Tr key={r.currency_id}><Td>{currencyName(r.currency_id)}</Td><Td money><span className={r.amount < 0 ? "text-negative" : "text-positive"}>{fmt(r.amount)}</span></Td></Tr>)}</DataTable></ReportBand>
    <ReportBand title="حركة الموظفين"><DataTable head={["الموظف", "العملية", "العدد"]}>{data.staff.map((r) => <Tr key={`${r.created_by}-${r.kind}`}><Td>{r.name ?? "موظف"}</Td><Td>{r.kind}</Td><Td money>{fmt(r.count)}</Td></Tr>)}</DataTable></ReportBand>
  </>;
}

function ReportBand({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mb-6 border-b border-border pb-5"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }