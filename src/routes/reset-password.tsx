import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateRecoveryPassword } from "@/lib/password-recovery";
import { useServerFn } from "@tanstack/react-start";
import { resetOwnAdminPassword } from "@/lib/password-recovery.functions";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "تعيين كلمة مرور جديدة — ابو طه للصرافة" },
    { name: "description", content: "استعادة آمنة لكلمة مرور حساب ابو طه للصرافة." },
    { property: "og:title", content: "استعادة الحساب — ابو طه للصرافة" },
    { property: "og:description", content: "تعيين كلمة مرور جديدة باستخدام تصريح استعادة صالح." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminRecovery, setAdminRecovery] = useState(false);
  const resetAdmin = useServerFn(resetOwnAdminPassword);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token_hash");
    const recovery = params.get("type") === "recovery";
    window.history.replaceState(null, "", window.location.pathname);
    if (!token || !recovery) {
      void supabase.auth.getUser().then(async ({ data, error }) => {
        if (error || !data.user) { setState("invalid"); return; }
        const role = await supabase.rpc("is_admin", { _user_id: data.user.id });
        if (role.error || !role.data) { setState("invalid"); return; }
        setAdminRecovery(true); setState("ready");
      }).catch(() => setState("invalid"));
      return;
    }
    void supabase.auth.verifyOtp({ token_hash: token, type: "recovery" })
      .then(({ data, error }) => setState(!error && data.session ? "ready" : "invalid"))
      .catch(() => setState("invalid"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state !== "ready" || busy) return;
    const invalid = validateRecoveryPassword(password, confirm);
    if (invalid) { toast.error(invalid); return; }
    setBusy(true);
    try {
      if (adminRecovery) await resetAdmin({ data: { password } });
      else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      setPassword(""); setConfirm(""); setState("invalid");
      await supabase.auth.signOut();
      toast.success("تم حفظ كلمة المرور الجديدة، سجّل الدخول بها");
      await navigate({ to: "/" });
    } catch {
      toast.error("تعذّر حفظ كلمة المرور. اختر كلمة قوية أو اطلب استعادة جديدة.");
    } finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
    <div className="w-full max-w-md space-y-6">
      <KeyRound className="size-10 text-primary" />
      <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
      {state === "checking" && <p role="status" className="text-muted-foreground">جارٍ التحقق من تصريح الاستعادة…</p>}
      {state === "invalid" && <><p role="alert" className="text-muted-foreground">تصريح الاستعادة غير صالح أو انتهت مدته. اطلب استعادة جديدة لحسابك.</p><Button onClick={() => navigate({ to: "/" })} variant="outline">العودة للدخول</Button></>}
      {state === "ready" && <form onSubmit={submit} className="space-y-5">
        <label className="block space-y-2"><span className="text-sm font-semibold">كلمة المرور الجديدة</span><Input required minLength={8} type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="block space-y-2"><span className="text-sm font-semibold">تأكيد كلمة المرور</span><Input required minLength={8} type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور الجديدة"}</Button>
      </form>}
    </div>
  </main>;
}