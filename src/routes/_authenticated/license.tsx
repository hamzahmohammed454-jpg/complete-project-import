import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyRound, Copy, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, LoadingRows, Notice } from "@/components/ui-kit";
import { SectionIntro } from "@/components/section";
import { useAppRoles } from "@/hooks/use-app-roles";
import type { LicenseStatus } from "@/lib/license";
export const Route = createFileRoute("/_authenticated/license")({
  head: () => ({ meta: [{ title: "التجربة والتفعيل — ابو طه للصرافة" }, { name: "description", content: "حالة ترخيص النظام وإدخال كود التفعيل الصادر من المالك." }, { property: "og:title", content: "التجربة والتفعيل — ابو طه للصرافة" }, { property: "og:description", content: "مدة التجربة والتفعيل وصلاحية تسجيل العمليات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LicenseScreen,
});
function LicenseScreen() {
  const qc = useQueryClient(); const { isAdmin, isLoading: rolesLoading } = useAppRoles();
  const [code, setCode] = useState(""); const [issued, setIssued] = useState(""); const [until, setUntil] = useState(""); const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["license-status"], enabled: isAdmin, queryFn: async () => { const r = await supabase.rpc("license_status"); if (r.error) throw r.error; return r.data as unknown as LicenseStatus; } });
  const codes = useQuery({ queryKey: ["activation-codes"], enabled: isAdmin && query.data?.is_owner === true, queryFn: async () => { const r = await supabase.from("activation_codes").select("id,created_at,licensed_until,used_at,revoked_at").order("created_at", { ascending: false }); if (r.error) throw r.error; return r.data; } });
  const date = (value: string) => new Intl.DateTimeFormat("ar", { timeZone: "Asia/Aden", dateStyle: "medium" }).format(new Date(value));
  async function activate(e: React.FormEvent) {
    e.preventDefault(); if (!await confirmAsk("تأكيد تنفيذ عملية التفعيل أو إصدار الكود؟")) return; setBusy(true);
    try { const r = await supabase.rpc("apply_activation_code", { p_code: code }); if (r.error) throw r.error; setCode(""); qc.invalidateQueries(); toast.success("تم التفعيل وأصبح تسجيل العمليات متاحًا"); }
    catch { toast.error("الكود غير صالح أو مستخدم أو ملغى"); } finally { setBusy(false); }
  }
  async function issue(e: React.FormEvent) {
    e.preventDefault(); if (!await confirmAsk("تأكيد تنفيذ عملية التفعيل أو إصدار الكود؟")) return; setBusy(true);
    try { const r = await supabase.rpc("issue_activation_code", until ? { p_until: `${until}T23:59:59+03:00` } : {}); if (r.error) throw r.error; const value = r.data as { code?: string }; if (!value.code) throw new Error("FAILED"); setIssued(value.code); qc.invalidateQueries({ queryKey: ["activation-codes"] }); }
    catch { toast.error("تعذّر إصدار الكود؛ الإصدار للمالك وحده"); } finally { setBusy(false); }
  }
  if (rolesLoading) return <LoadingRows />;
  if (!isAdmin) return <Notice tone="info">التفعيل وأكواد التفعيل لمدير النظام فقط.</Notice>;
  if (query.isLoading) return <LoadingRows />;
  if (query.isError || !query.data) return <Notice tone="danger">تعذّر تحميل حالة الترخيص.</Notice>;
  const status = query.data;
  return <><SectionIntro title="التجربة والتفعيل" subtitle={status.company_name} />
    <dl className="mb-6 grid gap-2 border-b border-border pb-5 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt>حالة التسجيل</dt><dd className="font-semibold">{status.can_write ? status.activated ? "مفعّل" : "تجريبي" : "قراءة فقط"}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>نهاية التجربة</dt><dd>{date(status.trial_ends_at)}</dd></div>{status.activated && <div className="flex flex-wrap justify-between gap-2"><dt>مدة التفعيل</dt><dd>{status.licensed_until ? `حتى ${date(status.licensed_until)}` : "دائم"}</dd></div>}<div className="grid gap-1"><dt>معرّف النسخة</dt><dd dir="ltr" className="ledger-figures break-all text-xs">{status.id}</dd></div></dl>
    {!status.can_write && <Notice tone="warn">تواصل مع المالك للحصول على كود؛ لا تُحذف بياناتك عند انتهاء التجربة.</Notice>}
    {isAdmin && <form className="mb-8 space-y-3" onSubmit={activate}><Field label="كود التفعيل"><Input required autoComplete="off" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={36} /></Field><Button disabled={busy}><KeyRound className="size-4" />تفعيل النسخة</Button></form>}
    {status.is_owner && <section className="border-t border-border pt-5"><h2 className="mb-4 font-semibold">إصدار الأكواد — المالك</h2><form onSubmit={issue} className="space-y-3"><Field label="صالح حتى (فارغ للتفعيل الدائم)"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field><Button disabled={busy}>إصدار كود جديد</Button></form>{issued && <div className="my-4 grid gap-3 border border-border p-3"><p dir="ltr" className="ledger-figures break-all text-sm">{issued}</p><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(issued); toast.success("نُسخ الكود"); } catch { toast.error("تعذّر النسخ"); } }}><Copy className="size-4" />نسخ الكود</Button><Notice>يظهر الكود هنا مرة واحدة، ويُستخدم مرة واحدة لهذه النسخة.</Notice></div>}{codes.isError && <Notice tone="danger">تعذّر تحميل سجل الأكواد.</Notice>}<ul className="mt-5 space-y-2">{codes.data?.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-xs"><span>{date(c.created_at)} · {c.used_at ? "مستخدم" : c.revoked_at ? "ملغى" : "لم يستخدم"} · {c.licensed_until ? date(c.licensed_until) : "دائم"}</span>{!c.used_at && !c.revoked_at && <Button variant="ghost" size="icon" aria-label="إلغاء الكود" disabled={busy} onClick={async () => { if (!await confirmAsk("تأكيد إلغاء كود التفعيل؟")) return; const r = await supabase.rpc("revoke_activation_code", { p_id: c.id }); if (r.error) toast.error("تعذّر الإلغاء"); else qc.invalidateQueries({ queryKey: ["activation-codes"] }); }}><Ban className="size-4" /></Button>}</li>)}</ul></section>}
  </>;
}