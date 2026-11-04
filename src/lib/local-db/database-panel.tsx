// «قاعدة البيانات» for the offline «أبو الياس» app (Holgen-style): backup,
// restore, share via WhatsApp/email, chart of accounts and new-year rollover.
import { useState } from "react";
import { toast } from "sonner";
import { ArchiveRestore, DatabaseBackup, ListTree, Mail, MessageCircle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, SectionCard } from "@/components/ui-kit";
import { downloadBlob } from "@/lib/download";
import { localDb } from "./runtime";
import { exportLocal, restoreLocal, rolloverYear, type LocalBackup } from "./maintenance";
import { ensureExchangeChart } from "./chart";
import { parseSeed } from "./import";

function backupName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `abu-elyas-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}

async function makeBackupFile() {
  const { pg } = await localDb();
  const b = await exportLocal(pg);
  const name = backupName();
  return new File([JSON.stringify(b)], name, { type: "application/json" });
}

async function share(file: File, via: "whatsapp" | "email") {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: "نسخة أبو الياس", text: via === "email" ? "نسخة احتياطية من تطبيق أبو الياس" : "نسخة أبو الياس" });
    return true;
  }
  downloadBlob(file, file.name);
  if (via === "whatsapp") window.open("https://wa.me/?text=" + encodeURIComponent("نسخة احتياطية من أبو الياس — أرفق الملف " + file.name), "_blank");
  else window.location.href = "mailto:?subject=" + encodeURIComponent("نسخة أبو الياس") + "&body=" + encodeURIComponent("أرفق الملف " + file.name);
  return false;
}

export function LocalDatabasePanel({ isAdmin }: { isAdmin: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [year, setYear] = useState(() => `${new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0)}-01-01`);
  const [backedUp, setBackedUp] = useState(false);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذّرت العملية"); } finally { setBusy(null); }
  }

  const create = () => run("backup", async () => { const f = await makeBackupFile(); downloadBlob(f, f.name); setBackedUp(true); toast.success("تم إنشاء النسخة الاحتياطية"); });
  const send = (via: "whatsapp" | "email") => run(via, async () => { const f = await makeBackupFile(); await share(f, via); setBackedUp(true); });
  const restore = (file: File) => run("restore", async () => {
    const b = parseSeed(await file.text()) as LocalBackup;
    if (!confirm("سيُستبدل كل ما على الهاتف بمحتوى هذه النسخة. متابعة؟")) return;
    const { pg } = await localDb();
    const r = await restoreLocal(pg, b);
    toast.success(`تم الاسترجاع: ${r.rows} سجلًا`);
    setTimeout(() => window.location.reload(), 800);
  });
  const chart = () => run("chart", async () => {
    const { pg } = await localDb();
    const n = await ensureExchangeChart(pg, true);
    toast.success(n ? `أُضيف ${n} حسابًا إلى شجرة الحسابات` : "شجرة الحسابات مكتملة");
  });
  const rollover = () => run("rollover", async () => {
    if (!backedUp) throw new Error("أنشئ نسخة احتياطية أولًا واحفظها خارج الهاتف");
    if (!confirm(`ستُحذف العمليات والسندات والسجل، وتبقى الحسابات والعملاء والإعدادات، ويُنشأ قيد افتتاحي بتاريخ ${year} بأرصدة نهاية السنة. لا يمكن التراجع إلا بالاسترجاع من النسخة. متابعة؟`)) return;
    const { pg } = await localDb();
    const r = await rolloverYear(pg, year);
    toast.success(`بدأت السنة الجديدة: ${r.lines} رصيدًا افتتاحيًا حتى ${r.until}`);
    setTimeout(() => window.location.reload(), 800);
  });

  const file = (accept: string, onPick: (f: File) => void, label: string, Icon: typeof DatabaseBackup, key: string) => (
    <label className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium ${busy ? "pointer-events-none opacity-60" : ""}`}>
      <Icon className="size-4" />{busy === key ? "جارٍ…" : label}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </label>
  );

  return (
    <SectionCard title="قاعدة البيانات" aside="على الهاتف">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={create} disabled={!!busy}><DatabaseBackup className="size-4" />{busy === "backup" ? "جارٍ…" : "إنشاء نسخة احتياطية"}</Button>
        {isAdmin ? file("application/json,.json", restore, "استرجاع نسخة", ArchiveRestore, "restore") : <span />}
        <Button variant="outline" onClick={() => send("whatsapp")} disabled={!!busy}><MessageCircle className="size-4" />نسخة إلى الواتساب</Button>
        <Button variant="outline" onClick={() => send("email")} disabled={!!busy}><Mail className="size-4" />نسخة إلى البريد</Button>
      </div>
      {isAdmin && (
        <>
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-sm font-semibold">شجرة الحسابات</p>
            <p className="text-xs text-muted-foreground">شجرة صرافة كاملة: الأصول والصناديق والبنوك والوكلاء والعملاء، الخصوم والأمانات، حقوق الملكية، الإيرادات والعمولات، والمصروفات بتفاصيلها. يُضاف الناقص فقط دون تغيير حساباتك.</p>
            <Button variant="outline" onClick={chart} disabled={!!busy} className="w-full"><ListTree className="size-4" />{busy === "chart" ? "جارٍ…" : "تجهيز شجرة الحسابات"}</Button>
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-sm font-semibold">ترحيل إلى قاعدة بيانات جديدة</p>
            <Notice>لبداية سنة جديدة: تبقى الحسابات والعملاء والوكلاء والصناديق والإعدادات، وتُحذف العمليات، ويُنشأ قيد افتتاحي بأرصدة كل حساب وصندوق. أنشئ نسخة احتياطية أولًا.</Notice>
            <label className="block text-xs text-muted-foreground">تاريخ الافتتاح
              <input type="date" value={year} onChange={(e) => setYear(e.target.value)} className="ledger-figures mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </label>
            <Button onClick={rollover} disabled={!!busy || !year} className="w-full"><CalendarClock className="size-4" />{busy === "rollover" ? "جارٍ الترحيل…" : "ترحيل لقاعدة جديدة بأرصدة افتتاحية"}</Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
