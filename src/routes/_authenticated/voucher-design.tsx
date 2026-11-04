import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { ZoomIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountNoticeCard } from "@/components/account-notice";
import { VoucherCard } from "@/components/voucher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { applyVoucherTpl, DEFAULT_PREFS, loadPrefs, savePrefs, type AppPrefs } from "@/lib/app-prefs";
import type { AccountNotice, VoucherModel } from "@/lib/voucher";

export const Route = createFileRoute("/_authenticated/voucher-design")({
  head: () => ({
    meta: [
      { title: "تصميم الإشعارات — ابو طه للصرافة" },
      { name: "description", content: "اختيار قالب السندات والإشعارات وألوانها وخطها مع معاينة مباشرة." },
      { property: "og:title", content: "تصميم الإشعارات — ابو طه للصرافة" },
      { property: "og:description", content: "اختيار قالب السندات والإشعارات وألوانها وخطها مع معاينة مباشرة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoucherDesign,
});

const TEMPLATES: { value: AppPrefs["voucherTpl"]; label: string }[] = [
  { value: "classic", label: "التصميم الحالي" },
  { value: "table", label: "جدول كلاسيكي" },
  { value: "rounded", label: "إطارات مستديرة" },
  { value: "compact", label: "جدول مختصر" },
  { value: "bare", label: "سند حوالة بدون حساب" },
];

const FONTS: { value: AppPrefs["voucherFontFamily"]; label: string }[] = [
  { value: "", label: "خط النظام" },
  { value: "Tajawal", label: "Tajawal" },
  { value: "Rubik", label: "Rubik" },
  { value: "Cairo", label: "Cairo" },
];

type OpType = "transfer" | "exchange" | "journal" | "cash";
const OP_TYPES: { value: OpType; label: string }[] = [
  { value: "transfer", label: "إرسال واستلام حوالة" },
  { value: "exchange", label: "بيع وشراء عملة" },
  { value: "journal", label: "قيد بسيط" },
  { value: "cash", label: "سند نقدي" },
];

const OPS: Record<OpType, { value: string; label: string; side: "debit" | "credit" }[]> = {
  transfer: [
    { value: "send", label: "إرسال حوالة", side: "debit" },
    { value: "receive", label: "استلام حوالة", side: "credit" },
  ],
  exchange: [
    { value: "buy", label: "شراء عملة", side: "credit" },
    { value: "sell", label: "بيع عملة", side: "debit" },
  ],
  journal: [
    { value: "entry", label: "قيد بسيط", side: "debit" },
  ],
  cash: [
    { value: "receipt", label: "سند قبض نقدي", side: "credit" },
    { value: "payment", label: "سند صرف نقدي", side: "debit" },
  ],
};

function sampleNotice(side: "debit" | "credit", opType: OpType): AccountNotice {
  const credit = side === "credit";
  const narrative: Record<OpType, string[]> = {
    transfer: credit
      ? ["مقابل حوالة واردة عن طريق وكيل تجريبي", "المرسل: مرسل تجريبي", "المستلم: عميل تجريبي"]
      : ["مقابل تحويل حوالة من حسابكم لدينا إلى: وكيل تجريبي", "المستلم: مستلم تجريبي"],
    exchange: credit
      ? ["مقابل شراء عملة حسب التفاصيل التالية"]
      : ["مقابل بيع عملة من حسابكم لدينا حسب التفاصيل التالية"],
    journal: credit
      ? ["مقابل قيد دائن على حسابكم لدينا"]
      : ["مقابل قيد مدين على حسابكم لدينا"],
    cash: [],
  };
  return {
    side,
    title: credit ? "إشعار دائن" : "إشعار مدين",
    number: "1008",
    date: new Date().toISOString().slice(0, 10),
    party: "عميل تجريبي",
    accountNumber: "231850",
    currency: "دولار",
    amount: 1000,
    fee: credit ? undefined : 15,
    amountWords: "ألف دولار لا غير",
    staff: "معاينة",
    narrative: narrative[opType],
  };
}

function sampleCash(kind: "receipt" | "payment"): VoucherModel {
  return {
    kind: "outgoing",
    title: kind === "receipt" ? "سند قبض نقدي (من الصندوق)" : "سند صرف نقدي (من الصندوق)",
    number: "1008",
    date: new Date().toISOString().slice(0, 10),
    amountFigure: "#1,020#",
    currency: "ريال سعودي",
    amountWords: "ألف وعشرون ريالًا سعوديًا لا غير",
    staff: "معاينة",
    rows: [
      { label: "السيد", value: "عميل تجريبي" },
      { label: "البيان", value: kind === "receipt" ? "قبض نقدي" : "صرف نقدي" },
      { label: "ملاحظة", value: "بيانات تجريبية لمعاينة التصميم" },
    ],
  };
}

function VoucherDesign() {
  const [p, setP] = useState<AppPrefs | null>(null);
  const [savedSnap, setSavedSnap] = useState("");
  const [opType, setOpType] = useState<OpType>("transfer");
  const [op, setOp] = useState("send");
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const loaded = loadPrefs();
    setP(loaded);
    setSavedSnap(JSON.stringify(loaded));
  }, []);

  // المعاينة تتغير مباشرة؛ عند الخروج بدون حفظ يُعاد المحفوظ
  useEffect(() => {
    if (p) applyVoucherTpl(p);
  }, [p]);
  useEffect(() => () => applyVoucherTpl(loadPrefs()), []);

  const dirty = useMemo(() => p !== null && JSON.stringify(p) !== savedSnap, [p, savedSnap]);

  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: () => dirty,
  });

  if (!p) return null;
  const set = <K extends keyof AppPrefs>(k: K, v: AppPrefs[K]) => setP({ ...p, [k]: v });

  const pickOpType = (t: OpType) => {
    setOpType(t);
    const first = OPS[t][0];
    if (!first) return;
    setOp(first.value);
    setSide(first.side);
  };
  const pickOp = (v: string) => {
    setOp(v);
    const found = OPS[opType].find((o) => o.value === v);
    if (found) setSide(found.side);
  };

  const preview =
    opType === "cash" ? (
      <VoucherCard model={sampleCash(op === "receipt" ? "receipt" : "payment")} />
    ) : (
      <AccountNoticeCard notice={sampleNotice(side, opType)} prefs={p} />
    );

  const save = () => {
    savePrefs(p);
    setSavedSnap(JSON.stringify(p));
    toast.success("تم حفظ تصميم الإشعارات");
  };

  return (
    <div className="space-y-4">
      {/* المعاينة */}
      <div className="space-y-2">
        <Button type="button" variant="ghost" className="mx-auto flex gap-1 text-primary" onClick={() => setZoom(true)}>
          <ZoomIn className="size-4" />
          تكبير المعاينة
        </Button>
        {preview}
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-3">
        <p className="text-center font-bold">أدوات التصميم — التغييرات تظهر مباشرة</p>

        {/* نوع العملية للمعاينة فقط */}
        <div className="grid gap-1 text-sm">
          <span className="font-bold">نوع العملية للمعاينة فقط</span>
          <Select value={opType} onValueChange={(v) => pickOpType(v as OpType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OP_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* عملية المعاينة */}
        <div className="grid gap-1 text-sm">
          <span className="font-bold">عملية المعاينة</span>
          <Select value={op} onValueChange={pickOp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPS[opType].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* مدين / دائن */}
        {opType !== "cash" && (
          <div className="grid grid-cols-2 overflow-hidden rounded-full border border-border text-sm font-bold">
            {(["debit", "credit"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`flex items-center justify-center gap-1 py-2.5 ${side === s ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
              >
                {side === s && <span aria-hidden>✓</span>}
                {s === "debit" ? "مدين" : "دائن"}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          نوع العملية يغيّر بيانات المعاينة فقط. القالب والألوان والخطوط والمقاسات موحّدة لجميع السندات.
        </p>

        {/* اسم السند في العنوان */}
        <label className="flex items-start justify-between gap-3 text-sm">
          <span>
            <span className="block font-bold">استخدام اسم السند بدلًا من مدين/دائن في العنوان</span>
            <span className="block text-xs text-muted-foreground">يُطبق على جميع قوالب السندات والإشعارات بعد الحفظ</span>
          </span>
          <Switch checked={p.useVoucherNameTitle} onCheckedChange={(v) => set("useVoucherNameTitle", v)} />
        </label>

        {/* القالب */}
        <div>
          <p className="mb-1 text-sm font-bold">اختر القالب</p>
          <div className="grid gap-1.5">
            {TEMPLATES.map((t) => (
              <label key={t.value} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                {t.label}
                <input type="radio" name="tpl" checked={p.voucherTpl === t.value} onChange={() => set("voucherTpl", t.value)} />
              </label>
            ))}
          </div>
        </div>

        {/* نوع الخط */}
        <div className="grid gap-1 text-sm">
          <span className="font-bold">نوع الخط</span>
          <Select value={p.voucherFontFamily || "system"} onValueChange={(v) => set("voucherFontFamily", (v === "system" ? "" : v) as AppPrefs["voucherFontFamily"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => <SelectItem key={f.value || "system"} value={f.value || "system"}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* حجم الخط */}
        <div className="grid gap-2 text-sm">
          <span className="font-bold">حجم الخط: <span className="ledger-figures">{p.voucherFont}%</span></span>
          <Slider dir="ltr" value={[p.voucherFont]} min={80} max={130} step={5} onValueChange={([v]) => set("voucherFont", v ?? p.voucherFont)} />
        </div>

        {/* خط عريض */}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-bold">خط عريض</span>
          <Switch checked={p.voucherBold} onCheckedChange={(v) => set("voucherBold", v)} />
        </label>

        {/* الألوان */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between gap-2 rounded-full border border-border px-3 py-2 text-sm font-bold">
            لون الجدول والعناوين
            <input
              type="color"
              aria-label="لون الجدول والعناوين"
              className="size-7 cursor-pointer rounded-full border border-border"
              value={p.voucherColor || "#0b4f7a"}
              onChange={(e) => set("voucherColor", e.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-full border border-border px-3 py-2 text-sm font-bold">
            لون الخط
            <input
              type="color"
              aria-label="لون الخط"
              className="size-7 cursor-pointer rounded-full border border-border"
              value={p.voucherTextColor || "#1a1a1a"}
              onChange={(e) => set("voucherTextColor", e.target.value)}
            />
          </label>
        </div>
        {(p.voucherColor || p.voucherTextColor) && (
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setP({ ...p, voucherColor: "", voucherTextColor: "" })}>
            إعادة الألوان الافتراضية
          </Button>
        )}

        {/* درجة تظليل الجدول */}
        <div className="grid gap-2 text-sm">
          <span className="font-bold">درجة تظليل الجدول</span>
          <Slider dir="ltr" value={[p.voucherShade]} min={0} max={40} step={5} onValueChange={([v]) => set("voucherShade", v ?? p.voucherShade)} />
        </div>

        {/* حقول إشعار المدين والدائن */}
        <div className="space-y-2 rounded-xl border border-border p-2">
          <p className="text-sm font-bold">حقول إشعار المدين والدائن</p>
          {([
            ["noticeShowAccount", "رقم الحساب"],
            ["noticeShowFee", "خدمات التحويل والإجمالي"],
            ["noticeShowWords", "المبلغ كتابةً"],
            ["noticeShowNarrative", "البيان"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-2 text-sm">
              {label}
              <Switch checked={p[k]} onCheckedChange={(v) => set(k, v)} />
            </label>
          ))}
          {([
            ["noticeCreditIntro", "عبارة إشعار الدائن", "نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية"],
            ["noticeDebitIntro", "عبارة إشعار المدين", "نود إشعاركم أننا قيدنا على حسابكم لدينا"],
            ["noticeNote", "ملاحظة أسفل الإشعار", "مثال: شكرًا لتعاملكم معنا"],
          ] as const).map(([k, label, ph]) => (
            <label key={k} className="grid gap-1 text-sm">
              <span>{label}</span>
              <input className="rounded-lg border border-input bg-background px-2 py-1.5" value={p[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          ترويسة نموذجية للمعاينة فقط، السندات الفعلية تستخدم ترويستك حسب إعدادات النظام. صورة عالية الدقة بعرض 2160 بكسل، والارتفاع حسب المحتوى دون فراغ سفلي.
        </p>

        <Button className="w-full" size="lg" onClick={save}>حفظ التصميم</Button>
        <Button variant="ghost" className="w-full" onClick={() => setP({ ...DEFAULT_PREFS, fontSize: p.fontSize, autoPrint: p.autoPrint, waShowNumber: p.waShowNumber, waShowBalance: p.waShowBalance, waShowDate: p.waShowDate, waShowShop: p.waShowShop, waHeader: p.waHeader, waFooter: p.waFooter })}>
          العودة للتصميم الحالي
        </Button>
        <p className="text-xs text-muted-foreground">المعاينة ببيانات تجريبية. الحفظ يعتمد التصميم لكل السندات على هذا الجهاز.</p>
      </section>

      {/* تكبير المعاينة */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>معاينة مكبّرة</DialogTitle>
          </DialogHeader>
          {preview}
        </DialogContent>
      </Dialog>

      {/* تغييرات لم تُحفظ */}
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغييرات لم تُحفظ</AlertDialogTitle>
            <AlertDialogDescription>هل تريد ترك التغييرات بدون حفظ؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>متابعة التعديل</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>ترك التغييرات</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
