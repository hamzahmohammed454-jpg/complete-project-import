import { useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmAsk } from "@/components/confirm-dialog";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, LoadingRows, Notice } from "@/components/ui-kit";
import { useOfflineStatus } from "@/hooks/use-offline-status";

type SessionStatus = { has_pin: boolean; locked: boolean; failed_attempts: number };
type SecurityState = { status: SessionStatus; needsMfa: boolean; factorId: string | undefined };

export function SessionSecurity({ children }: { children: React.ReactNode }) {
  const { online } = useOfflineStatus();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [localLocked, setLocalLocked] = useState(false);
  useEffect(() => {
    const lock = () => { setLocalLocked(true); void qc.cancelQueries(); };
    window.addEventListener("staff-local-lock", lock);
    return () => window.removeEventListener("staff-local-lock", lock);
  }, [qc]);
  const query = useQuery({ queryKey: ["session-security"], enabled: online, refetchInterval: online ? 30_000 : false, queryFn: async () => {
    const [status, assurance, factors] = await Promise.all([supabase.rpc("staff_session_status"), supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
    if (status.error) throw status.error; if (assurance.error) throw assurance.error; if (factors.error) throw factors.error;
    return { status: status.data as unknown as SessionStatus, needsMfa: assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2", factorId: factors.data.totp.find((factor) => factor.status === "verified")?.id };
  } });
  async function exit() { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); window.location.assign("/"); }
  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (query.data?.needsMfa) {
        const factorId = query.data.factorId; if (!factorId) throw new Error("FAILED");
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("unlock_staff_session", { p_pin: pin });
        if (error || !data) throw error ?? new Error("FAILED");
      }
      setCode(""); setPin(""); const verified = await query.refetch();
      if (!verified.data || verified.data.needsMfa || verified.data.status.locked || verified.isError) throw new Error("FAILED");
      setLocalLocked(false); qc.invalidateQueries();
    } catch { toast.error(query.data?.needsMfa ? "رمز التحقق غير صحيح" : "الرقم غير صحيح؛ بعد 5 محاولات يلزم تسجيل الدخول من جديد"); await query.refetch(); }
    finally { setBusy(false); }
  }
  if (!online && !query.data) return <div className="p-6"><Notice tone="warn">يلزم الاتصال للتحقق من قفل الشاشة والصلاحيات عند إعادة فتح التطبيق؛ العمليات المحفوظة على الهاتف لم تُحذف.</Notice><Button onClick={() => query.refetch()}>إعادة المحاولة</Button></div>;
  if (localLocked && (!online || !query.data?.status.has_pin && !query.data?.needsMfa)) return <main className="grid min-h-screen place-items-center bg-background p-5"><div className="space-y-4 text-center"><LockKeyhole className="mx-auto size-10 text-primary" /><h1 className="text-xl font-bold">الشاشة مقفلة</h1><Notice tone="warn">{online ? "سجّل الدخول من جديد للتحقق من هويتك." : "اتصل بالإنترنت للتحقق وفتح الشاشة."}</Notice>{online && <Button onClick={exit}>تسجيل الدخول من جديد</Button>}</div></main>;
  if (query.isLoading) return <div className="p-6"><LoadingRows /></div>;
  if (query.isError && (!query.data || query.data.needsMfa || query.data.status.locked || online)) return <div className="p-6"><Notice tone="danger">{online ? "تعذّر التحقق من أمان الجلسة." : "يلزم الاتصال للتحقق من قفل الشاشة والصلاحيات عند إعادة فتح التطبيق؛ العمليات المحفوظة على الهاتف لم تُحذف."}</Notice><Button onClick={() => query.refetch()}>إعادة المحاولة</Button><Button variant="outline" onClick={exit}>تسجيل الخروج</Button></div>;
  if (query.data && (query.data.needsMfa || query.data.status.locked || localLocked)) return <main className="grid min-h-screen place-items-center bg-background p-5"><form className="w-full max-w-sm space-y-5" onSubmit={unlock}><LockKeyhole className="mx-auto size-10 text-primary" /><h1 className="text-center text-xl font-bold">{query.data.needsMfa ? "التحقق بخطوتين" : "الشاشة مقفلة"}</h1><Field label={query.data.needsMfa ? "رمز تطبيق المصادقة" : "رقم قفل الشاشة"}><Input required type="password" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={query.data.needsMfa ? code : pin} onChange={(e) => query.data?.needsMfa ? setCode(e.target.value.replace(/\D/g, "")) : setPin(e.target.value.replace(/\D/g, ""))} /></Field><Button className="w-full" disabled={busy || (!query.data.needsMfa && query.data.status.failed_attempts >= 5)}>فتح</Button><Button type="button" variant="outline" className="w-full" onClick={exit}>تسجيل الخروج</Button></form></main>;
  return <>{children}</>;
}

export function QuickLock() {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  async function lock() {
    if (!navigator.onLine) { window.dispatchEvent(new Event("staff-local-lock")); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("staff_session_status"); if (error) throw error;
      if (!(data as unknown as SessionStatus).has_pin) { setSetup(true); return; }
      window.dispatchEvent(new Event("staff-local-lock"));
      await qc.cancelQueries();
      const res = await supabase.rpc("lock_staff_session"); if (res.error) throw res.error;
      qc.setQueryData<SecurityState>(["session-security"], (current) => current ? { ...current, status: { ...current.status, locked: true } } : undefined);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "session-security" });
      await qc.invalidateQueries({ queryKey: ["session-security"] });
    } catch { toast.error("تعذّر قفل الشاشة"); } finally { setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!await confirmAsk("تأكيد حفظ رقم القفل وقفل الشاشة؟")) return; setBusy(true);
    try { const { error } = await supabase.rpc("set_staff_session_pin", { p_pin: pin }); if (error) throw error; setPin(""); setSetup(false); await lock(); }
    catch { toast.error("اختر رقمًا من 6 خانات"); } finally { setBusy(false); }
  }
  return <><Button variant="ghost" size="icon" aria-label="قفل الشاشة" title="قفل الشاشة" disabled={busy} onClick={lock} className="text-primary-foreground"><LockKeyhole className="size-4" /></Button>{setup && <div role="dialog" aria-modal="true" aria-label="إعداد قفل الشاشة" className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-5 text-foreground"><form onSubmit={save} className="w-full max-w-sm space-y-4"><h2 className="font-bold">رقم قفل هذه الجلسة</h2><Field label="رقم من 6 خانات"><Input autoFocus required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field><Button disabled={busy} className="w-full">حفظ وقفل</Button><Button type="button" variant="outline" className="w-full" onClick={() => { setSetup(false); setPin(""); }}>إلغاء</Button></form></div>}</>;
}