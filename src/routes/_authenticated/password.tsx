import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormCard } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { MfaSettings } from "@/components/mfa-settings";

export const Route = createFileRoute("/_authenticated/password")({
  head: () => ({ meta: [{ title: "أمان الحساب — ابو طه للصرافة" }, { name: "description", content: "تغيير كلمة المرور وإعداد الدخول بخطوتين لحساب الموظف." }, { property: "og:title", content: "أمان الحساب — ابو طه للصرافة" }, { property: "og:description", content: "إعدادات أمان حساب الموظف." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PasswordScreen,
});

function PasswordScreen() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("كلمة المرور الجديدة ٨ أحرف على الأقل");
      return;
    }
    if (next !== confirm) {
      toast.error("كلمتا المرور الجديدتان غير متطابقتين");
      return;
    }
    if (next === current) {
      toast.error("اختر كلمة مرور مختلفة عن الحالية");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("NO_USER");
      // تحقق من كلمة المرور الحالية قبل التغيير
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (check.error) {
        toast.error("كلمة المرور الحالية غير صحيحة");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
      if (error) throw error;
      logActivity("تغيير كلمة المرور");
      toast.success("تم تغيير كلمة المرور. استخدمها في الدخول القادم.");
      navigate({ to: "/app" });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      toast.error(
        msg.includes("weak") || msg.includes("pwned") || msg.includes("leaked")
          ? "كلمة المرور ضعيفة أو مسرّبة — اختر أقوى"
          : "تعذّر تغيير كلمة المرور",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionIntro title="تغيير كلمة المرور" subtitle="غيّر كلمة مرور حسابك بنفسك. ٨ أحرف على الأقل." />
      <FormCard onSubmit={submit} className="mb-0">
        <Field label="كلمة المرور الحالية">
          <Input required type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="كلمة المرور الجديدة">
          <Input required minLength={8} type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="تأكيد كلمة المرور الجديدة">
          <Input required minLength={8} type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
        </Button>
      </FormCard>
      <MfaSettings />
    </>
  );
}
