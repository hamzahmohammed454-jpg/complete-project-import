import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Brush, KeyRound, Moon, PenLine, Printer, Type } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { applyWaPrefs } from "@/lib/whatsapp";
import { loadPrefs, savePrefs, type AppPrefs } from "@/lib/app-prefs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الضبط - الإعدادات — ابو طه للصرافة" },
      { name: "description", content: "إعدادات النظام: حجم الخط، الوضع الليلي، الطباعة التلقائية، ومسح الذاكرة المؤقتة." },
      { property: "og:title", content: "الضبط - الإعدادات — ابو طه للصرافة" },
      { property: "og:description", content: "إعدادات الجهاز والسندات والإشعارات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsScreen,
});

function Row({ icon: Icon, title, sub, to, onClick }: { icon: typeof Brush; title: string; sub: string; to?: string; onClick?: () => void }) {
  const body = (
    <div className="flex items-center gap-3 border-b border-border py-4">
      <Icon className="size-7 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <ChevronLeft className="size-5 text-primary" />
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : <button type="button" className="w-full text-start" onClick={onClick}>{body}</button>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-3">
      <span className="text-[15px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function SettingsScreen() {
  const qc = useQueryClient();
  const { dark, toggle } = useDarkMode();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  useEffect(() => setPrefs(loadPrefs()), []);
  if (!prefs) return null;
  const set = <K extends keyof AppPrefs>(k: K, v: AppPrefs[K]) => setPrefs({ ...prefs, [k]: v });

  async function clearCache() {
    if (!await confirmAsk("مسح الذاكرة المؤقتة؟ لا يحذف البيانات ولا الإعدادات.")) return;
    qc.clear();
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    toast.success("تم مسح الذاكرة المؤقتة");
  }

  return (
    <div className="space-y-2">
      <Row icon={Printer} title="مسح الذاكرة المؤقتة" sub="يحذف ملفات الكاش فقط ولا يحذف البيانات أو الإعدادات" onClick={clearCache} />
      <Row icon={KeyRound} title="تغيير كلمة المرور" sub="كلمة مرور دخولك للنظام" to="/password" />

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <p className="mb-2 flex items-center gap-2 font-bold"><Type className="size-5 text-primary" />حجم الخط</p>
        <div className="grid grid-cols-3 gap-2">
          {(["small", "normal", "large"] as const).map((s) => (
            <Button key={s} variant={prefs.fontSize === s ? "default" : "outline"} onClick={() => set("fontSize", s)}>
              {s === "small" ? "صغير" : s === "normal" ? "عادي" : "كبير"}
            </Button>
          ))}
        </div>
      </section>

      <section className="divide-y divide-border rounded-2xl bg-card px-4 shadow-card">
        <label className="flex items-center justify-between gap-3 py-3"><span className="flex items-center gap-2 text-[15px]"><Moon className="size-4" />الوضع الليلي</span><Switch checked={dark} onCheckedChange={toggle} /></label>
        <Link to="/voucher-design" className="block rounded-lg border border-border p-2 text-sm font-bold">تصميم الإشعارات والسندات ←</Link>
        <Toggle label="طباعة السندات تلقائي بعد الحفظ" checked={prefs.autoPrint} onChange={(v) => set("autoPrint", v)} />
        <Toggle label="عرض رقم السند في رسالة الواتساب" checked={prefs.waShowNumber} onChange={(v) => set("waShowNumber", v)} />
        <Toggle label="عرض الرصيد في رسالة الواتساب" checked={prefs.waShowBalance} onChange={(v) => set("waShowBalance", v)} />
        <Toggle label="عرض التاريخ في رسالة الواتساب" checked={prefs.waShowDate} onChange={(v) => set("waShowDate", v)} />
        <Toggle label="تضمين اسم المحل في الرسائل" checked={prefs.waShowShop} onChange={(v) => set("waShowShop", v)} />
        <label className="block text-sm">سطر في أول الرسالة
          <input className="mt-1 w-full rounded-lg border border-border bg-background p-2" value={prefs.waHeader} onChange={(e) => set("waHeader", e.target.value)} placeholder="مثال: عزيزنا العميل" />
        </label>
        <label className="block text-sm">سطر في آخر الرسالة
          <input className="mt-1 w-full rounded-lg border border-border bg-background p-2" value={prefs.waFooter} onChange={(e) => set("waFooter", e.target.value)} placeholder="مثال: شكراً لتعاملكم معنا" />
        </label>
        <div className="rounded-lg border border-positive/40 bg-card p-2 text-sm">
          <p className="mb-1 text-xs text-muted-foreground">معاينة الرسالة</p>
          <pre className="whitespace-pre-wrap font-sans">{applyWaPrefs("السيد/ محمد\nالرصيد لكم 50,000 ريال يمني\nحتى يوم 2026-10-28", prefs)}</pre>
        </div>
      </section>

      <Button className="w-full" size="lg" onClick={() => confirmOperation("حفظ الإعدادات", () => { savePrefs(prefs); toast.success("تم الحفظ"); })}>حفظ</Button>
      <p className="text-center text-xs text-muted-foreground">هذه الإعدادات تُحفظ على هذا الجهاز فقط.</p>
    </div>
  );
}
