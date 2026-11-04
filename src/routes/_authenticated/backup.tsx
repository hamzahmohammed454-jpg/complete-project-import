import { createFileRoute } from "@tanstack/react-router";
import { DatabaseBackup, FileCheck2, ShieldAlert, Smartphone } from "lucide-react";
import { buildSnapshot, verifySnapshot } from "@/lib/backup-snapshot";
import { useState } from "react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Notice, SectionCard } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { backupFilename, tablesToWorkbook, type BackupSheet } from "@/lib/backup";
import { adenDate } from "@/lib/closing";
import { downloadBlob } from "@/lib/download";
import { xlsxBlob } from "@/lib/statement-xlsx";
import { collectPages } from "@/lib/paginated-read";
import { buildAbuSeed } from "@/lib/abu-export";
import { IS_LOCAL_APP, LocalDatabasePanel } from "@/lib/local-mode";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "نسخ البيانات — ابو طه للصرافة" }, { name: "description", content: "تصدير سجلات النظام المالية والإدارية إلى Excel." }, { property: "og:title", content: "نسخ البيانات — ابو طه للصرافة" }, { property: "og:description", content: "تنزيل بيانات العمليات والإعدادات المصرح بها." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BackupScreen,
});

/** كل جداول النظام وأسماء أوراقها في ملف النسخة. */
const TABLES: readonly { table: string; sheet: string }[] = [
  { table: "branches", sheet: "الفروع" },
  { table: "currencies", sheet: "العملات" },
  { table: "currency_prices", sheet: "أسعار الصرف" },
  { table: "accounts", sheet: "الحسابات" },
  { table: "customers", sheet: "العملاء" },
  { table: "agents", sheet: "الوكلاء" },
  { table: "boxes", sheet: "الصناديق" },
  { table: "box_movements", sheet: "حركات الصناديق" },
  { table: "entries", sheet: "القيود" },
  { table: "entries_details", sheet: "تفاصيل القيود" },
  { table: "outgoing_transfers", sheet: "الحوالات الصادرة" },
  { table: "incoming_transfers", sheet: "الحوالات الواردة" },
  { table: "buy_currencies", sheet: "شراء العملات" },
  { table: "sell_currencies", sheet: "بيع العملات" },
  { table: "cash_vouchers", sheet: "سندات العملاء" },
  { table: "checks", sheet: "الشيكات" },
  { table: "banks", sheet: "البنوك" },
  { table: "check_books", sheet: "دفاتر الشيكات" },
  { table: "bank_accounts", sheet: "الحسابات البنكية" },
  { table: "funds_inventory", sheet: "جرد الصناديق" },
  { table: "funds_inventory_details", sheet: "تفاصيل جرد الصناديق" },
  { table: "loop_entries", sheet: "القيود الدائرية" },
  { table: "loop_entries_details", sheet: "تفاصيل القيود الدائرية" },
  { table: "loop_entries_runs", sheet: "توليدات القيود الدائرية" },
  { table: "cost_centers", sheet: "مراكز التكلفة" },
  { table: "financial_years", sheet: "السنوات المالية" },
  { table: "commission_rules", sheet: "قواعد العمولات" },
  { table: "agent_settlements", sheet: "تسويات الوكلاء" },
  { table: "box_closings", sheet: "إقفالات الصناديق" },
  { table: "period_closings", sheet: "الإقفالات المحاسبية" },
  { table: "activity_log", sheet: "سجل العمليات" },
  { table: "customer_transfer_movements", sheet: "حركات حوالات الحساب" },
  { table: "journal_vouchers", sheet: "سندات القيود" },
  { table: "currency_rate_history", sheet: "الأسعار التاريخية" },
  { table: "staff_announcements", sheet: "أخبار الموظفين" },
  { table: "staff_work_defaults", sheet: "إعدادات عمل الموظفين" },
  { table: "user_groups", sheet: "مجموعات الموظفين" },
  { table: "user_group_members", sheet: "أعضاء المجموعات" },
  { table: "group_screen_permissions", sheet: "صلاحيات الشاشات" },
  { table: "user_screen_permissions", sheet: "صلاحيات الموظفين الخاصة" },
];

const ADMIN_ONLY = ["activity_log", "staff_announcements", "staff_work_defaults", "user_groups", "user_group_members", "group_screen_permissions", "user_screen_permissions"];

async function fetchAll(isAdmin: boolean) {
  const out: { table: string; sheet: string; rows: Record<string, unknown>[] }[] = [];
  for (const t of TABLES) {
    if (!isAdmin && ADMIN_ONLY.includes(t.table)) continue;
    const rows = await collectPages(async (from, until) => {
      const key = t.table === "staff_work_defaults" ? "user_id" : "id";
      const { data, error } = await supabase.from(t.table as never).select("*").order(key).range(from, until);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    });
    out.push({ ...t, rows });
  }
  return out;
}

async function liveCount(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table as never).select("*", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

type CheckRow = { table: string; label: string; file: number; live: number | null };

function BackupScreen() {
  const { isManager, isAdmin, isLoading: rolesLoading } = useAppRoles();
  const [busy, setBusy] = useState<null | "xlsx" | "json" | "verify" | "abu">(null);
  const [abuProgress, setAbuProgress] = useState("");
  const [check, setCheck] = useState<{ created: string; problems: string[]; rows: CheckRow[] } | null>(null);

  const runBackup = async () => {
    setBusy("xlsx");
    try {
      const data = await fetchAll(isAdmin);
      const sheets: BackupSheet[] = data.map((t) => ({ name: t.sheet, rows: t.rows }));
      downloadBlob(xlsxBlob(tablesToWorkbook(sheets)), backupFilename(adenDate()));
      logActivity("نسخ احتياطي", "backup", { tables: sheets.length });
      toast.success(`نُزّلت النسخة الاحتياطية (${sheets.length} جدولًا)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إنشاء النسخة الاحتياطية");
    } finally {
      setBusy(null);
    }
  };

  const runSnapshot = async () => {
    setBusy("json");
    try {
      const data = await fetchAll(isAdmin);
      const snap = await buildSnapshot(data, new Date().toISOString());
      const blob = new Blob([JSON.stringify(snap)], { type: "application/json" });
      downloadBlob(blob, `نسخة-استرجاع-${adenDate()}.json`);
      logActivity("نسخة استرجاع", "backup", { tables: data.length, format: "json" });
      toast.success("نُزّلت نسخة الاسترجاع — جرّب فحصها الآن من الأسفل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إنشاء نسخة الاسترجاع");
    } finally {
      setBusy(null);
    }
  };

  const runAbuExport = async () => {
    setBusy("abu");
    try {
      const seed = await buildAbuSeed((d, t) => setAbuProgress(`${d}/${t}`));
      const rows = Object.values(seed.tables).reduce((n, r) => n + r.length, 0);
      downloadBlob(new Blob([JSON.stringify(seed)], { type: "application/json" }), `بيانات-أبو-الياس-${adenDate()}.json`);
      logActivity("تصدير لتطبيق أبو الياس", "backup", { tables: Object.keys(seed.tables).length, rows });
      toast.success(`نُزّل ملف أبو الياس (${rows} سجلًا) — انقله إلى الهاتف واختره عند أول تشغيل`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تجهيز ملف أبو الياس");
    } finally {
      setBusy(null);
      setAbuProgress("");
    }
  };

  const verifyFile = async (file: File) => {
    setBusy("verify");
    setCheck(null);
    try {
      const r = await verifySnapshot(await file.text());
      if (!r.ok) { toast.error(r.error); return; }
      const rows: CheckRow[] = [];
      for (const m of r.tables) {
        rows.push({ table: m.table, label: TABLES.find((t) => t.table === m.table)?.sheet ?? m.table, file: m.count, live: await liveCount(m.table) });
      }
      setCheck({ created: r.created_at, problems: r.problems, rows });
      logActivity("فحص نسخة استرجاع", "backup", { ok: r.problems.length === 0 });
      if (r.problems.length) toast.error("النسخة فيها مشاكل — لا تعتمد عليها");
      else toast.success("النسخة سليمة وقابلة للاسترجاع");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="النسخ الاحتياطي" subtitle="تصدير البيانات ونسخ الاسترجاع وفحصها" />

      {rolesLoading ? null : !isManager ? (
        <Notice tone="danger" icon={ShieldAlert}>
          النسخ الاحتياطي متاح للمدير فقط، لأنه يشمل كل بيانات النظام.
        </Notice>
      ) : (
        <>
          <SectionCard title="نسخة الاسترجاع الكاملة" aside="موصى بها يوميًا">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              ملف واحد فيه كل السجلات كما هي، مع بصمة لكل جدول تكشف أي نقص أو تلف. احفظه خارج الجهاز (بريد أو قرص خارجي).
            </p>
            <Button onClick={runSnapshot} disabled={!!busy} className="w-full">
              <DatabaseBackup className="size-4" />
              {busy === "json" ? "جارٍ تجهيز النسخة…" : "تنزيل نسخة الاسترجاع"}
            </Button>
          </SectionCard>

          <SectionCard title="تجربة الاسترجاع (فحص النسخة)">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              اختر ملف نسخة سابقة: يُقرأ بالكامل ويُتحقق من كل جدول ويُقارن عدد سجلاته بالنظام الآن. الفحص لا يغيّر أي بيانات.
            </p>
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
              <FileCheck2 className="size-4" />
              {busy === "verify" ? "جارٍ الفحص…" : "اختيار ملف النسخة وفحصه"}
              <input type="file" accept="application/json,.json" className="hidden" disabled={!!busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void verifyFile(f); }} />
            </label>
            {check && (
              <div className="mt-3 space-y-2">
                <Notice tone={check.problems.length ? "danger" : "success"}>
                  {check.problems.length
                    ? `وُجدت ${check.problems.length} مشكلة: ${check.problems.join("، ")}`
                    : `النسخة سليمة — أُخذت في ${new Date(check.created).toLocaleString("ar")}`}
                </Notice>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr><th className="p-2 text-start">الجدول</th><th className="p-2">في النسخة</th><th className="p-2">في النظام الآن</th></tr></thead>
                    <tbody>
                      {check.rows.map((r) => (
                        <tr key={r.table} className="border-t">
                          <td className="p-2">{r.label}</td>
                          <td className="ledger-figures p-2 text-center">{r.file}</td>
                          <td className={`ledger-figures p-2 text-center ${r.live !== null && r.live < r.file ? "text-destructive" : ""}`}>{r.live ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">رقم أقل في «النظام الآن» يعني سجلات حُذفت بعد أخذ النسخة.</p>
              </div>
            )}
          </SectionCard>

          {IS_LOCAL_APP && <LocalDatabasePanel isAdmin={isAdmin} />}

          {isAdmin && !IS_LOCAL_APP && (
            <SectionCard title="تصدير لتطبيق أبو الياس" aside="مرة واحدة">
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                ملف بكل بيانات النظام يُنقل إلى هاتف «أبو الياس» ويُختار عند أول تشغيل. بعدها يعمل الهاتف وحده دون إنترنت، ولا يتزامن مع هذا النظام. الملف يحوي كل بيانات العملاء فاحفظه بأمان واحذفه بعد النقل.
              </p>
              <Button variant="outline" onClick={runAbuExport} disabled={!!busy} className="w-full">
                <Smartphone className="size-4" />
                {busy === "abu" ? `جارٍ التجهيز… ${abuProgress}` : "تصدير لتطبيق أبو الياس"}
              </Button>
            </SectionCard>
          )}

          <SectionCard title="تصدير Excel للمراجعة" aside={`${TABLES.length} مجموعة بيانات`}>
            <Notice>ملف Excel للقراءة والمراجعة فقط، ولا يصلح للاسترجاع.</Notice>
            <Button variant="outline" onClick={runBackup} disabled={!!busy} className="w-full">
              <DatabaseBackup className="size-4" />
              {busy === "xlsx" ? "جارٍ تجهيز الملف…" : "تنزيل Excel"}
            </Button>
          </SectionCard>
        </>
      )}
    </>
  );
}
