// Offline "أبو الياس" build: boots the phone database before any screen runs
// and offers the one-time data copy on first launch.
import { useEffect, useState, type ReactNode } from "react";
import { getMeta } from "./engine";
import { installLocalFetch, localAdminExists, localDb } from "./runtime";
import { importSeed, parseSeed } from "./import";
import { ensureExchangeChart } from "./chart";
import "./brand.css";
// Fonts ship inside the app: the phone may never reach the internet.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/readex-pro/400.css";
import "@fontsource/readex-pro/600.css";
import "@fontsource/readex-pro/700.css";
import "@fontsource/aref-ruqaa/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";

export const IS_LOCAL_APP = true;

if (typeof window !== "undefined") {
  // The phone database is always reachable, so screens never switch to their "no internet" mode.
  Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => true });
  installLocalFetch(import.meta.env["VITE_SUPABASE_URL"] as string);
  void localDb();
  void navigator.storage?.persist?.();
}

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "welcome" } | { kind: "ready" };

export function LocalGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  async function check() {
    try {
      const { pg } = await localDb();
      const imported = await getMeta(pg, "imported");
      const skipped = await getMeta(pg, "started_empty");
      setState(imported || skipped || (await localAdminExists()) ? { kind: "ready" } : { kind: "welcome" });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "تعذّر فتح قاعدة البيانات" });
    }
  }
  useEffect(() => { void check(); }, []);
  // The full exchange chart of accounts is added once, after the phone has its data.
  useEffect(() => {
    if (state.kind !== "ready") return;
    void localDb().then(({ pg }) => ensureExchangeChart(pg)).catch(() => undefined);
  }, [state.kind]);

  async function importFile(file: File) {
    setBusy("جارٍ نسخ البيانات إلى الهاتف…");
    try {
      const seed = parseSeed(await file.text());
      const { pg } = await localDb();
      const r = await importSeed(pg, seed);
      setBusy(null);
      alert(`تم نسخ ${r.rows} سجلًا من ${r.tables} جدولًا. عيّن الآن كلمة مرور المدير.`);
      setState({ kind: "ready" });
    } catch (e) {
      setBusy(null);
      alert(e instanceof Error ? e.message : "تعذّر نسخ البيانات");
    }
  }

  async function startEmpty() {
    const { pg } = await localDb();
    await pg.query("insert into public.local_meta(key, value) values ('started_empty', to_jsonb(now())) on conflict do nothing");
    setState({ kind: "ready" });
  }

  if (state.kind === "ready") return <>{children}</>;
  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <p className="brand-title text-3xl">أبو الياس</p>
      <p className="text-sm text-muted-foreground">للصرافة والتحويلات المالية — يعمل دون إنترنت</p>
      {state.kind === "loading" && <p className="text-sm">جارٍ تجهيز قاعدة البيانات على الهاتف…</p>}
      {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      {state.kind === "welcome" && (
        <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 text-start shadow-card">
          <p className="font-semibold">أول تشغيل</p>
          <p className="text-sm text-muted-foreground">انسخ بيانات نظام الصرافة مرة واحدة: من نظام الصرافة افتح «نسخ البيانات» واضغط «تصدير لتطبيق أبو الياس»، ثم اختر الملف هنا.</p>
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            اختيار ملف البيانات
            <input type="file" accept="application/json,.json" className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          </label>
          <button type="button" disabled={!!busy} onClick={() => void startEmpty()} className="h-11 w-full rounded-xl border border-border text-sm font-medium">البدء بدون بيانات</button>
          {busy && <p className="text-sm text-primary">{busy}</p>}
          <p className="text-xs text-muted-foreground">بعد النسخ يعمل أبو الياس وحده ولا يتزامن مع نظام الصرافة.</p>
        </div>
      )}
    </div>
  );
}
export { LocalDatabasePanel } from "./database-panel";
