import { useState } from "react";
import { confirmAsk } from "@/components/confirm-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice } from "@/components/ui-kit";

export function MfaSettings() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["mfa-factors"], queryFn: async () => { const { data, error } = await supabase.auth.mfa.listFactors(); if (error) throw error; return data.all.filter((factor) => factor.factor_type === "totp"); } });
  async function enroll() {
    if (!await confirmAsk("تأكيد بدء تفعيل التحقق بخطوتين؟")) return;
    setBusy(true);
    try {
      for (const factor of query.data ?? []) { if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id }); }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "نظام الصرافة", issuer: "Sarraf" }); if (error) throw error;
      setPending({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch { toast.error("تعذّر بدء التحقق بخطوتين"); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); if (!pending || !await confirmAsk("تأكيد تفعيل التحقق بخطوتين؟")) return; setBusy(true);
    try { const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.id, code }); if (error) throw error; setPending(null); setCode(""); qc.invalidateQueries(); toast.success("فُعّل التحقق بخطوتين"); }
    catch { toast.error("رمز التحقق غير صحيح"); } finally { setBusy(false); }
  }
  async function disable(id: string) {
    if (!await confirmAsk("إلغاء التحقق بخطوتين لحسابك؟")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error("تعذّر إلغاء التحقق؛ أكمل التحقق من الجلسة أولاً"); else { qc.invalidateQueries(); toast.success("أُلغي التحقق بخطوتين"); }
  }
  return <section className="mt-6 border-t border-border pt-5"><h2 className="mb-3 font-semibold">التحقق بخطوتين</h2>{query.isError && <Notice tone="danger">تعذّر قراءة إعدادات الأمان.</Notice>}{query.data?.filter((f) => f.status === "verified").map((f) => <div key={f.id} className="flex items-center justify-between gap-3"><span className="text-sm text-positive">مفعّل</span><Button variant="outline" size="sm" onClick={() => disable(f.id)}>إلغاء التفعيل</Button></div>)}{!query.isLoading && !query.data?.some((f) => f.status === "verified") && !pending && <Button disabled={busy} onClick={enroll}>تفعيل التحقق بخطوتين</Button>}{pending && <form className="mt-3 space-y-3" onSubmit={verify}><img className="mx-auto size-52" src={pending.qr.startsWith("data:") ? pending.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(pending.qr)}`} alt="رمز إعداد تطبيق المصادقة" /><p dir="ltr" className="break-all text-center font-mono text-xs">{pending.secret}</p><Field label="رمز تطبيق المصادقة"><Input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field><Button disabled={busy}>تأكيد التفعيل</Button><Button type="button" variant="outline" onClick={async () => { if (!await confirmAsk("إلغاء إعداد التحقق بخطوتين؟")) return; await supabase.auth.mfa.unenroll({ factorId: pending.id }); setPending(null); }}>إلغاء</Button></form>}</section>;
}