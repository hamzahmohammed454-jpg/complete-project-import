import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { Link } from "@tanstack/react-router";
import { allAccountsQuery } from "@/lib/all-accounts-query";
import { partiesInStatementGroup, type GroupAccount } from "@/lib/statement-groups";
import { debtFollowup } from "@/lib/debt-followup";
import { adenDate } from "@/lib/closing";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";
import { downloadBlob } from "@/lib/download";
import { xlsxBlob } from "@/lib/statement-xlsx";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Field, Notice, Segments, Td, Tr } from "@/components/ui-kit";
export function DebtFollowupReport({ accounts = [], groupId = null, groupName }: { accounts?: GroupAccount[]; groupId?: number | null; groupName?: string | undefined }) {
  const { data } = useSuspenseQuery(allAccountsQuery);
  const currencies = useSuspenseQuery({ queryKey: ["currencies"], queryFn: async () => { const r = await supabase.from("currencies").select("id,currency_name").order("the_number"); if (r.error) throw r.error; return r.data; } });
  const permissions = useScreenPermissions("/statement");
  const [asOf, setAsOf] = useState(adenDate());
  const [mode, setMode] = useState<"due" | "all">("due");
  const [kind, setKind] = useState<"all" | "customer" | "agent">("all");
  const [currency, setCurrency] = useState("");
  const scopedData = { ...data, customers: partiesInStatementGroup(data.customers, accounts, groupId), agents: partiesInStatementGroup(data.agents, accounts, groupId) };
  const rows = debtFollowup(scopedData, asOf).filter((r) => (mode === "all" || r.needs_followup) && (kind === "all" || kind === r.kind) && (!currency || r.currency_id === Number(currency)));
  const nameOf = (id: number) => currencies.data.find((c) => c.id === id)?.currency_name ?? String(id);
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["متابعة الديون الأسبوعية", asOf, groupName ?? "كافة المجموعات"], ["الاسم", "النوع", "العملة", "لنا عليه", "آخر حركة", "أيام دون حركة"], ...rows.map((r) => [r.name, r.kind === "agent" ? "وكيل" : "عميل", nameOf(r.currency_id), r.net, r.last_activity, r.inactive_days])]);
    XLSX.utils.book_append_sheet(wb, ws, "متابعة أسبوعية"); wb.Workbook = { Views: [{ RTL: true }] };
    downloadBlob(xlsxBlob(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer), `متابعة الديون - ${asOf}.xlsx`);
  }
  return <section className="space-y-4">
    <div className="grid grid-cols-2 gap-3 print:hidden"><Field label="حتى يوم"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || adenDate())} /></Field><Field label="العملة"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">كافة العملات</option>{currencies.data.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}</select></Field></div>
    <div className="print:hidden"><Segments ariaLabel="فترة المتابعة" value={mode} onChange={setMode} options={[{ value: "due", label: "أسبوع فأكثر" }, { value: "all", label: "كل المدينين" }]} /><Segments ariaLabel="أطراف المتابعة" value={kind} onChange={setKind} options={[{ value: "all", label: "الكل" }, { value: "customer", label: "العملاء" }, { value: "agent", label: "الوكلاء" }]} /></div>
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">متابعة الديون الأسبوعية</h2><div className="flex gap-1 print:hidden"><Button variant="outline" size="icon" title="تنزيل Excel" aria-label="تنزيل المتابعة Excel" disabled={!permissions.can("print")} onClick={exportExcel}><FileSpreadsheet className="size-4" /></Button><Button variant="outline" size="icon" title="طباعة المتابعة" aria-label="طباعة المتابعة" disabled={!permissions.can("print")} onClick={() => window.print()}><Printer className="size-4" /></Button></div></div>
    <p className="text-xs text-muted-foreground">الرصيد حتى <span className="ledger-figures">{asOf}</span> · المدة منذ آخر حركة مسجلة، وليست مدة تأخر فاتورة.</p>
    {!rows.length ? <Notice>لا توجد ديون مطابقة للمتابعة.</Notice> : <DataTable head={["الطرف", "العملة", "لنا عليه", "آخر حركة", "أيام"]}>{rows.map((r) => <Tr key={`${r.kind}-${r.id}-${r.currency_id}`}><Td><Link to="/statement" search={{ type: r.kind, id: r.id }} className="font-medium text-primary">{r.name}</Link><p className="text-xs text-muted-foreground">{r.kind === "agent" ? "وكيل" : "عميل"}</p></Td><Td>{nameOf(r.currency_id)}</Td><Td money>{fmt(r.net)}</Td><Td money>{r.last_activity}</Td><Td money>{r.inactive_days}</Td></Tr>)}</DataTable>}
  </section>;
}