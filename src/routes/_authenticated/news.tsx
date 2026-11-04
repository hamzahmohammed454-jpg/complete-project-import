import { confirmOperation } from "@/lib/operation-confirmation";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormCard, LoadingRows, Notice } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/news")({
  head: () => ({ meta: [{ title: "أخبار الموظفين — ابو طه للصرافة" }, { name: "description", content: "إدارة أخبار وتعليمات مدير النظام للموظفين." }, { property: "og:title", content: "أخبار الموظفين — ابو طه للصرافة" }, { property: "og:description", content: "الأخبار والتعليمات المعتمدة للموظفين." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewsScreen,
});

function NewsScreen() {
  const { isAdmin, isLoading: rolesLoading } = useAppRoles();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [until, setUntil] = useState("");
  const query = useQuery({ queryKey: ["news-management"], enabled: isAdmin, queryFn: async () => {
    const { data, error } = await supabase.from("staff_announcements").select("*").order("created_at", { ascending: false });
    if (error) throw error; return data;
  } });
  const save = useMutation({ mutationFn: async () => {
    const { error } = await supabase.from("staff_announcements").insert({ title: title.trim(), body: body.trim(), ends_at: until ? new Date(`${until}T23:59:59+03:00`).toISOString() : null });
    if (error) throw error;
  }, onSuccess: () => { setTitle(""); setBody(""); setUntil(""); refresh(); toast.success("نُشر الخبر للموظفين"); }, onError: () => toast.error("تعذّر نشر الخبر") });
  const toggle = useMutation({ mutationFn: async (row: { id: string; active: boolean }) => {
    const { data, error } = await supabase.from("staff_announcements").update({ active: !row.active }).eq("id", row.id).select("id").single();
    if (error || !data) throw error ?? new Error("FAILED");
  }, onSuccess: refresh, onError: () => toast.error("تعذّر تعديل الخبر") });
  function refresh() { qc.invalidateQueries({ queryKey: ["news-management"] }); qc.invalidateQueries({ queryKey: ["staff-announcements"] }); }
  if (rolesLoading) return <LoadingRows />;
  if (!isAdmin) return <Notice>إدارة الأخبار لمدير النظام فقط.</Notice>;
  return <><SectionIntro title="أخبار الموظفين" subtitle="رسائل مدير النظام" />
    <FormCard onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label="عنوان الخبر"><Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="الخبر"><Textarea required maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Field label="آخر يوم للعرض (اختياري)"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      <Button type="submit" disabled={save.isPending || !title.trim() || !body.trim()}>نشر الخبر</Button>
    </FormCard>
    {query.isLoading ? <LoadingRows /> : query.isError ? <Notice tone="danger">تعذّر تحميل الأخبار.</Notice> : <ul className="space-y-3">{query.data?.map((row) => <li key={row.id} className="rounded-lg border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{row.title}</h2><Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => confirmOperation(row.active ? "إيقاف عرض الخبر" : "إظهار الخبر للموظفين", () => toggle.mutate(row))}>{row.active ? "إيقاف" : "إظهار"}</Button></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.body}</p><p className="ledger-figures mt-2 text-xs text-muted-foreground">{row.ends_at ? `حتى ${row.ends_at.slice(0, 10)}` : "بلا تاريخ انتهاء"}</p></li>)}</ul>}
  </>;
}