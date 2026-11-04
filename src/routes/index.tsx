import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, User, Loader2, Eye, EyeOff, ArrowLeft, ArrowLeftRight, Repeat, Wallet, Percent, ShieldCheck, KeyRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { usernameToEmail } from "@/lib/username";
import { getSetupStatus, setupFirstAdmin, FIRST_ADMIN_USERNAME } from "@/lib/setup.functions";
import { Button } from "@/components/ui/button";
import exchangeEmblem from "@/assets/abu-taha-emblem-3d-notes.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الدخول — ابو طه للصرافة" },
      {
        name: "description",
        content: "دخول موظفي ابو طه للصرافة إلى نظام الحوالات والصناديق وشجرة الحسابات.",
      },
      { property: "og:title", content: "ابو طه للصرافة — تسجيل الدخول" },
      {
        property: "og:description",
        content: "دخول موظفي ابو طه للصرافة إلى نظام الحوالات والصناديق وشجرة الحسابات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [confirm, setConfirm] = useState("");

  // Someone who is already signed in never sees the login screen.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/app" });
    });
    getSetupStatus()
      .then((s) => {
        if (!cancelled && s.needsSetup) {
          setNeedsSetup(true);
          setUsername(FIRST_ADMIN_USERNAME);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsSetup) {
      if (password.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
      if (password !== confirm) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    }
    setBusy(true);
    try {
      if (needsSetup) {
        await setupFirstAdmin({ data: { password } });
        setNeedsSetup(false);
        toast.success("تم إنشاء حساب مدير النظام");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (error) throw error;
      logActivity("تسجيل دخول");
      navigate({ to: "/app" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        needsSetup
          ? msg === "WEAK_PASSWORD"
            ? "كلمة المرور ضعيفة ومعروفة، اختر كلمة أقوى تجمع حروفاً وأرقاماً ورموزاً"
            : "تعذّر إنشاء الحساب، حاول مرة أخرى"
          : "اسم المستخدم أو كلمة المرور غير صحيحة",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="relative overflow-hidden rounded-b-[2.5rem] bg-brand px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-20 text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full border border-gold/30" />
        <div aria-hidden className="pointer-events-none absolute -left-6 -top-6 size-36 rounded-full border border-gold/20" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-10 size-52 rounded-full bg-gold/10 blur-2xl" />

        <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
          <img src={exchangeEmblem} alt="شعار ابو طه للصرافة والتحويلات" width={543} height={706} className="size-32 object-contain drop-shadow-xl" />
          <p className="brand-title mt-3 text-3xl leading-tight">ابو طه للصرافة</p>
          <p className="mt-1 text-xs font-semibold tracking-wide text-gold">للصرافة والتحويلات المالية</p>


          <ul className="mt-6 grid w-full grid-cols-4 gap-2">
            {MODULES.map((m) => (
              <li key={m.label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-primary-foreground/10 px-1 py-2.5 ring-1 ring-primary-foreground/10">
                <m.icon className="size-4 text-gold" strokeWidth={2.2} />
                <span className="text-[10.5px] font-medium text-primary-foreground/85">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <main className="relative mx-auto -mt-12 w-full max-w-md flex-1 px-5 pb-8">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-float">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="display text-lg font-bold leading-tight">{needsSetup ? "أول دخول — مدير النظام" : "تسجيل الدخول"}</h1>
              <p className="text-xs text-muted-foreground">
                {needsSetup ? "اختر كلمة مرور لحساب مدير النظام (8 أحرف على الأقل)" : "أدخل اسم المستخدم وكلمة المرور للمتابعة"}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field icon={<User className="size-4" />} label="اسم المستخدم" value={username} onChange={needsSetup ? () => {} : setUsername} required autoComplete="username" dir="ltr" />
            <Field
              icon={<Lock className="size-4" />}
              label={needsSetup ? "كلمة المرور الجديدة" : "كلمة المرور"}
              value={password}
              onChange={setPassword}
              required
              type={showPw ? "text" : "password"}
              autoComplete={needsSetup ? "new-password" : "current-password"}
              dir="ltr"
              trailing={
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              }
            />
            {needsSetup && (
              <Field
                icon={<Lock className="size-4" />}
                label="تأكيد كلمة المرور"
                value={confirm}
                onChange={setConfirm}
                required
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                dir="ltr"
              />
            )}
            <Button
              type="submit"
              disabled={busy}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-float transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {needsSetup ? "إنشاء كلمة المرور والدخول" : "دخول"}
              {!busy && <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />}
            </Button>
          </form>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-dashed border-border bg-paper px-4 py-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            الحسابات يُنشئها مدير النظام لكل موظف. إن نسيت كلمة المرور تواصل معه.
          </p>
        </div>
      </main>

      <footer className="pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 text-center text-[11px] text-muted-foreground">
        <span className="brand-title text-base">ابو طه للصرافة</span>
        <span className="mx-1.5">•</span>
        للصرافة والتحويلات المالية
      </footer>
    </div>
  );
}

const MODULES = [
  { label: "حوالات", icon: ArrowLeftRight },
  { label: "بيع وشراء", icon: Repeat },
  { label: "صناديق", icon: Wallet },
  { label: "عمولات", icon: Percent },
] as const;

function Field({
  icon,
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  inputMode,
  dir,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "numeric" | "text";
  dir?: "ltr" | "rtl";
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-foreground/80">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 transition-colors focus-within:border-primary focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30">
        <span className="text-primary/70">{icon}</span>
        <input
          className="w-full bg-transparent py-3 text-sm outline-none"
          type={type}
          value={value}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          dir={dir}
          onChange={(e) => onChange(e.target.value)}
        />
        {trailing}
      </span>
    </label>
  );
}
