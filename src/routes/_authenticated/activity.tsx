import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History } from "lucide-react";

import { PendingNote, SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, ListItem, LoadingRows, StatusPill, Toolbar, selectCls } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/money";
import { adenDate } from "@/lib/closing";
import { collectPages } from "@/lib/paginated-read";
import {
  MONITOR_REPORTS, employeeRows, isMonitorReport, savedByDocument, savedRows, sessionRows, userSummaries, usersOf,
  type LogRow, type MonitorReportId,
} from "@/lib/user-monitor";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "سجل العمليات — ابو طه للصرافة" }, { name: "description", content: "مراجعة سجل تعديلات العمليات وحركات الموظفين داخل النظام." }, { property: "og:title", content: "سجل العمليات — ابو طه للصرافة" }, { property: "og:description", content: "مراجعة سجل تعديلات العمليات وحركات الموظفين داخل النظام." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  // تقارير «رقابة المستخدمين» أوضاع للشاشة نفسها: /activity?r=<id>
  validateSearch: (s: Record<string, unknown>): { r?: MonitorReportId } => (isMonitorReport(s["r"]) ? { r: s["r"] } : {}),
  component: ActivityScreen,
});

const TABLE_NAMES: Record<string, string> = {
  accounts: "الحسابات", agents: "الوكلاء", boxes: "الصناديق", box_movements: "حركة الصناديق", branches: "الفروع",
  buy_currencies: "شراء عملة", sell_currencies: "بيع عملة", commission_rules: "العمولات", currencies: "العملات",
  currency_prices: "الأسعار", customers: "العملاء", entries: "القيود", entries_details: "تفاصيل القيود",
  incoming_transfers: "حوالة واردة", outgoing_transfers: "حوالة صادرة", user_roles: "الصلاحيات", profiles: "بيانات الموظف",
  checks: "الشيكات", cash_vouchers: "سندات العملاء", journal_vouchers: "سندات القيد", box_closings: "إقفال الصناديق",
};
const PAGE_NAMES: Record<string, string> = {
  "/app": "الرئيسية", "/transfers": "الحوالات", "/exchange": "البيع والشراء", "/boxes": "الصناديق", "/accounts": "شجرة الحسابات",
  "/entries": "القيود", "/customers": "العملاء", "/agents": "الوكلاء", "/currencies": "العملات", "/commissions": "العمولات", "/transfer-setup": "تهيئة الحوالات",
  "/reports": "التقارير", "/staff": "الموظفون", "/activity": "سجل العمليات", "/vouchers": "سندات العملاء",
  "/journal": "سند قيد بسيط", "/checks": "الشيكات", "/closing": "الإقفال اليومي", "/statement": "كشف الحساب",
  "/financials": "القوائم المالية", "/totals": "الإجماليات", "/password": "تغيير كلمة المرور",
};

const ACTION_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  "إضافة": "ok",
  "تعديل": "warn",
  "حذف": "bad",
  "دخول": "ok",
  "تسجيل خروج": "neutral",
  "تغيير كلمة المرور": "warn",
  "فتح شاشة": "neutral",
  "نقر": "neutral",
};

function ActivityScreen() {
  const { r } = Route.useSearch();
  const { roles, isLoading: rl } = useAppRoles();
  const isAdmin = roles.includes("admin");
  if (rl) return <LoadingRows rows={3} />;
  if (!isAdmin) return <PendingNote text="سجل العمليات ورقابة المستخدمين يطّلع عليها مدير النظام فقط." />;
  return r ? <MonitorReport id={r} /> : <ActivityList />;
}

function ActivityList() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, username, action, target, details, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const rows = q.trim() ? data.filter((r) => (r.username ?? "").includes(q.trim().toLowerCase())) : data;

  return (
    <>
      <MenuStrip tab="/reports" />
      <SectionIntro title="سجل العمليات" subtitle="كل دخول وفتح شاشة ونقرة وإضافة وتعديل وحذف، مع اسم الموظف والوقت." />
      <Toolbar
        search={<Input dir="ltr" placeholder="تصفية باسم المستخدم" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {isLoading ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="لا توجد عمليات مسجلة بعد"
          hint="كل ما يفعله الموظفون من دخول وفتح شاشات ونقرات يُسجَّل هنا تلقائيًا."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const label = (r.details as { label?: string } | null)?.label;
            const target = r.target ? TABLE_NAMES[r.target] ?? PAGE_NAMES[r.target] ?? r.target : "";
            return (
              <ListItem key={r.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.action}
                      {target && <span className="font-normal text-muted-foreground"> — {target}</span>}
                    </p>
                    {label && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill tone={ACTION_TONE[r.action] ?? "neutral"}>{r.action}</StatusPill>
                    <span dir="ltr" className="text-[11px] font-semibold text-primary">{r.username ?? "—"}</span>
                  </div>
                </div>
                <p className="ledger-figures mt-1 text-[11px] text-muted-foreground">{fmtDateTime(r.created_at)}</p>
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

const targetName = (t: string | null) => (t ? TABLE_NAMES[t] ?? PAGE_NAMES[t] ?? t : "—");
const daysAgo = (n: number) => adenDate(new Date(Date.now() - n * 86400000));

function MonitorReport({ id }: { id: MonitorReportId }) {
  const title = MONITOR_REPORTS.find((x) => x.id === id)?.label ?? "رقابة المستخدمين";
  const [from, setFrom] = useState(daysAgo(7));
  const [until, setUntil] = useState(adenDate(new Date()));
  const [user, setUser] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity_log", "monitor", from, until],
    queryFn: () =>
      collectPages<LogRow>(async (a, b) => {
        const { data, error } = await supabase
          .from("activity_log")
          .select("id, user_id, username, action, target, created_at")
          .gte("created_at", `${from}T00:00:00+03:00`)
          .lte("created_at", `${until}T23:59:59+03:00`)
          .order("created_at", { ascending: false })
          .range(a, b);
        if (error) throw error;
        return data;
      }),
  });
  const users = usersOf(data);

  return (
    <>
      <SectionIntro title={title} subtitle="رقابة المستخدمين — قراءة فقط من سجل العمليات." />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="من تاريخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="ledger-figures" /></Field>
      </div>
      {id === "employee" && (
        <div className="mb-3">
          <Field label="الموظف">
            <select className={selectCls} value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">اختر الموظف</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
      )}
      {isLoading ? <LoadingRows rows={5} /> : <MonitorBody id={id} rows={data} user={user} />}
    </>
  );
}

function MonitorBody({ id, rows, user }: { id: MonitorReportId; rows: LogRow[]; user: string }) {
  const empty = <EmptyState icon={History} title="لا توجد بيانات في هذه الفترة" hint="غيّر التاريخ أو انتظر حتى يعمل الموظفون على النظام." />;
  if (id === "by-doc") {
    const g = savedByDocument(rows);
    if (!g.length) return empty;
    return <Table head={["المستند", "نوع العملية", "العدد"]} rows={g.map((x) => [targetName(x.target), x.action, String(x.count)])} />;
  }
  if (id === "last-edit" || id === "monitor" || id === "works") {
    const s = userSummaries(rows);
    if (!s.length) return empty;
    const dt = (v: string | null) => (v ? fmtDateTime(v) : "—");
    if (id === "last-edit") return <Table head={["المستخدم", "عدد التعديلات", "آخر تعديل"]} rows={s.map((x) => [x.user, String(x.edited), dt(x.lastEdit)])} />;
    if (id === "monitor") return <Table head={["المستخدم", "آخر دخول", "آخر نشاط", "الشاشات المفتوحة", "مرات الدخول"]} rows={s.map((x) => [x.user, dt(x.lastLogin), dt(x.lastActivity), String(x.screens), String(x.sessions)])} />;
    return <Table head={["المستخدم", "إضافة", "تعديل", "حذف", "كل العمليات"]} rows={s.map((x) => [x.user, String(x.added), String(x.edited), String(x.deleted), String(x.total)])} />;
  }
  const list = id === "saved" ? savedRows(rows) : id === "sessions" ? sessionRows(rows) : user ? employeeRows(rows, user) : [];
  if (id === "employee" && !user) return <EmptyState icon={History} title="اختر الموظف" hint="تظهر كل عملياته في الفترة المحددة." />;
  if (!list.length) return empty;
  return <Table head={["الوقت", "المستخدم", "العملية", "المستند / الشاشة"]} rows={list.map((x) => [fmtDateTime(x.created_at), x.username ?? "—", x.action, targetName(x.target)])} />;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => <td key={j} className="ledger-figures whitespace-nowrap px-2 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ledger-figures border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">عدد السطور: {rows.length}</p>
    </div>
  );
}
