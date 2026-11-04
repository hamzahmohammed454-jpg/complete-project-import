import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Input } from "@/components/ui/input";
import { Field, LoadingRows, Notice } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { fmt } from "@/lib/money";
import { checksInWindow, transfersOlderThan, type ManagementAlerts } from "@/lib/management-reports";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "تنبيهات المدير — ابو طه للصرافة" }, { name: "description", content: "الشيكات المستحقة والحوالات المعلقة وتجاوزات الأسعار وفروقات الصناديق." }, { property: "og:title", content: "تنبيهات المدير — ابو طه للصرافة" }, { property: "og:description", content: "مراجعة العمليات التي تحتاج متابعة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AlertsScreen,
});

function AlertsScreen() {
  const { isManager, isLoading: roleLoading } = useAppRoles();
  const [checkDays, setCheckDays] = useState(0);
  const [transferDays, setTransferDays] = useState(0);
  const query = useQuery({ queryKey: ["management-alerts", adenDate()], enabled: isManager, queryFn: async () => {
    const { data, error } = await supabase.rpc("management_alerts", { p_date: adenDate() }); if (error) throw error; return data as unknown as ManagementAlerts;
  } });
  const currencies = useQuery({ queryKey: ["currencies"], queryFn: async () => { const { data, error } = await supabase.from("currencies").select("id,currency_name").order("the_number"); if (error) throw error; return data; } });
  const name = (id: number) => currencies.data?.find((c) => c.id === id)?.currency_name ?? id;
  if (roleLoading) return <LoadingRows />;
  if (!isManager) return <Notice>التنبيهات متاحة للمدير فقط.</Notice>;
  return <><MenuStrip tab="/reports" /><SectionIntro title="تنبيهات المدير" subtitle="متابعة العمليات" />
    <div className="mb-5 grid grid-cols-2 gap-3"><Field label="استحقاق الشيك خلال أيام"><Input type="number" min={0} max={365} value={checkDays} onChange={(e) => setCheckDays(Math.max(0, Number(e.target.value)))} /></Field><Field label="عمر الحوالة بالأيام على الأقل"><Input type="number" min={0} value={transferDays} onChange={(e) => setTransferDays(Math.max(0, Number(e.target.value)))} /></Field></div>
    {query.isLoading ? <LoadingRows /> : query.isError ? <Notice tone="danger">تعذّر تحميل التنبيهات.</Notice> : query.data && <div className="space-y-6">
      <section><h2 className="mb-3 font-semibold">الشيكات المستحقة</h2><ul className="space-y-2">{checksInWindow(query.data.checks, checkDays).map((c) => <li key={c.id}><Link to="/checks"><Notice tone={c.days < 0 ? "danger" : "warn"}><span className="ledger-figures">{c.number} · {fmt(c.amount)} {name(c.currency_id)} · {c.date}</span></Notice></Link></li>)}</ul>{!checksInWindow(query.data.checks, checkDays).length && <Notice>لا توجد شيكات مستحقة ضمن الاختيار.</Notice>}</section>
      <section><h2 className="mb-3 font-semibold">الحوالات المعلقة</h2><ul className="space-y-2">{transfersOlderThan(query.data.transfers, transferDays).map((t) => <li key={`${t.direction}-${t.id}`}><Link to="/transfers" search={{ dir: t.direction }}><Notice tone="warn"><span className="block">{t.sender_name} ← {t.receiver_name}</span><span className="ledger-figures">{t.number ?? t.id} · {fmt(t.amount)} {name(t.currency_id)} · {t.days} يوم</span></Notice></Link></li>)}</ul>{!transfersOlderThan(query.data.transfers, transferDays).length && <Notice>لا توجد حوالات معلقة ضمن الاختيار.</Notice>}</section>
      <section><h2 className="mb-3 font-semibold">تجاوزات أسعار العملات</h2>{query.data.prices.map((p) => <Link key={`${p.currency_id}-${p.updated_at}`} to="/currencies"><Notice tone="danger">{name(p.currency_id)} · شراء {fmt(p.buy_price)} · بيع {fmt(p.sell_price)}</Notice></Link>)}{!query.data.prices.length && <Notice>لا تجاوزات لحدود الأسعار المسجلة.</Notice>}</section>
      <section><h2 className="mb-3 font-semibold">فروقات إقفال اليوم</h2>{query.data.cash_differences.map((c) => <Link key={c.id} to="/closing"><Notice tone="danger"><span className="ledger-figures">صندوق {c.box_id} · {fmt(c.difference)} {name(c.currency_id)}</span></Notice></Link>)}{!query.data.cash_differences.length && <Notice>لا فروقات إقفال مسجلة لليوم.</Notice>}</section>
    </div>}
  </>;
}