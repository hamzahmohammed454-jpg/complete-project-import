import { useSystemSettings } from "@/hooks/use-system-settings";
import { IS_LOCAL_APP } from "@/lib/local-mode";
import { MONITOR_REPORTS } from "@/lib/user-monitor";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, House, KeyRound, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { StaffNews } from "@/components/staff-news";
import { LicenseBanner } from "@/components/license-banner";
import { SessionSecurity, QuickLock } from "@/components/session-security";

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { useScreenAccess } from "@/hooks/use-screen-access";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { LoadingRows, Notice } from "@/components/ui-kit";
import { groupItems, NAV_GROUPS } from "@/lib/nav-groups";
import { applyFontSize, applyVoucherTpl, loadPrefs } from "@/lib/app-prefs";
import { Button } from "@/components/ui/button";
import { useAppRoles } from "@/hooks/use-app-roles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import exchangeEmblem from "@/assets/abu-taha-emblem-3d-notes.png";
import { voucherScreenType, type VoucherKind } from "@/lib/voucher-screen";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <SessionSecurity><UnlockedAppShell>{children}</UnlockedAppShell></SessionSecurity>;
}

function UnlockedAppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const transferDir = useRouterState({ select: (s) => (s.location.search as { dir?: string }).dir });
  const transferView = useRouterState({ select: (s) => (s.location.search as { view?: string }).view });
  const exchangeKind = useRouterState({ select: (s) => (s.location.search as { kind?: string }).kind });
  const voucherSearch = useRouterState({ select: (s) => s.location.search as { kind?: VoucherKind; multi?: boolean } });
  const monitorReport = useRouterState({ select: (s) => (s.location.search as { r?: string }).r });
  // قبض الحوالة وتوريدها وصرفها وتصديرها، وشراء العملات وبيعها، شاشات مستقلة لكل منها عنوانها
  const pageTitle = usePageTitle(
    path,
    path === "/transfers"
      ? (transferView === "pay" ? "صرف الحوالات" : transferView === "export" ? "تصدير الحوالات" : transferDir === "incoming" ? "توريد حوالة" : "قبض حوالة")
      : path === "/exchange"
        ? (exchangeKind === "sell" ? "بيع العملات النقدية" : "شراء العملات النقدية")
        : path === "/vouchers"
          ? `سند ${voucherScreenType(voucherSearch.kind)}${voucherSearch.multi ? " متعدد العملات" : ""}`
        : path === "/activity" && monitorReport
          ? MONITOR_REPORTS.find((x) => x.id === monitorReport)?.label
          : undefined,
  );
  useEffect(() => { const p = loadPrefs(); applyFontSize(p.fontSize); applyVoucherTpl(p); }, []);
  const { dark, toggle } = useDarkMode();
  const { canSee } = useScreenAccess();
  const { isAdmin, isLoading: rolesLoading } = useAppRoles();
  const segments = path.split("/");
  const voucherSource = segments[2] === "incoming" || segments[2] === "outgoing" ? "/transfers" : segments[2] === "buy" || segments[2] === "sell" ? "/exchange" : segments[2] === "journal" ? "/journal" : "/vouchers";
  const pagePermissions = useScreenPermissions(segments[1] === "voucher" ? voucherSource : "/" + (segments[1] ?? ""));
  const licenseDenied = path === "/license" && !isAdmin;
  const alwaysAccessible = path === "/app" || path === "/password" || path === "/sync" || path === "/settings" || path === "/voucher-design" || (path === "/license" && isAdmin);
  const offline = useOfflineStatus();
  const administrationItems = groupItems("/administration").filter((item) => canSee(item.to));

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("branch_name, username, full_name")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setBranch(data?.branch_name ?? "");
          setUserLabel(data?.username || data?.full_name || "");
        });
    });
  }, []);

  // سجل النشاط: فتح كل شاشة
  useEffect(() => {
    logActivity("فتح شاشة", path);
  }, [path]);

  // سجل النشاط: كل نقرة على زر أو رابط
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("button, a, [role=button]");
      if (!el) return;
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80);
      logActivity("نقر", window.location.pathname, { label });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const setting = useSystemSettings();
  const idleMinutes = Number(setting("gen.idle_minutes"));
  const warnExit = setting("gen.warn_exit") === true || setting("gen.warn_close_windows") === true;
  useEffect(() => {
    if (!warnExit) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [warnExit]);
  useEffect(() => {
    if (!(idleMinutes > 0)) return;
    let timer = window.setTimeout(expire, idleMinutes * 60000);
    function expire() { logActivity("انتهاء جلسة خاملة"); void supabase.auth.signOut().then(() => { queryClient.clear(); navigate({ to: "/", replace: true }); }); }
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(expire, idleMinutes * 60000); };
    const evs = ["pointerdown", "keydown", "scroll"] as const;
    evs.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => { window.clearTimeout(timer); evs.forEach((ev) => window.removeEventListener(ev, reset)); };
  }, [idleMinutes]);

  async function signOut() {
    logActivity("تسجيل خروج");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const isHome = path === "/app";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-muted/80 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2.5 text-foreground backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {isHome ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <img src={exchangeEmblem} alt="" width={36} height={36} loading="lazy" className="size-11 shrink-0 object-contain drop-shadow-md" />
              <div className="min-w-0 leading-tight">
                <p className="brand-title truncate text-lg">ابو طه للصرافة والتحويلات</p>
                <p className="truncate text-[11px] text-muted-foreground">{branch || "المركز الرئيسي"}{userLabel ? ` · ${userLabel}` : ""}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="رجوع" onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: "/app" }))} className="shrink-0">
                <ArrowRight className="size-6" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="الصفحة الرئيسية" onClick={() => navigate({ to: "/app" })} className="shrink-0">
                <House className="size-5" />
              </Button>
              <h1 className="truncate text-lg font-bold">{pageTitle}</h1>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            {IS_LOCAL_APP ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">على الهاتف</span>
            ) : (
            <Link to="/sync" aria-label="حالة الاتصال والمزامنة" className={"ledger-figures rounded-full px-2 py-0.5 text-[10px] font-semibold " + (offline.failed ? "bg-destructive text-destructive-foreground" : offline.online ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground")}>
              {offline.online ? "متصل" : "غير متصل"}{offline.items.length ? ` · ${offline.items.length}` : ""}
            </Link>
            )}
            {isHome && <>
              <QuickLock />
              <Button variant="ghost" size="icon" type="button" onClick={toggle} aria-label={dark ? "الوضع الفاتح" : "الوضع الليلي"}>
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
            </>}
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="الأدوات الإدارية" title="الأدوات الإدارية">
                  <Settings2 className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bg-popover opacity-100">
                <DropdownMenuLabel>الأدوات</DropdownMenuLabel>
                <DropdownMenuItem asChild><Link to="/app"><House />الواجهة الرئيسية</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings"><Settings2 />الضبط - الإعدادات</Link></DropdownMenuItem>
                {administrationItems.filter((item) => item.to === "/administration").map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}><item.icon />{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/password"><KeyRound />تغيير كلمة المرور</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}><LogOut />تسجيل الخروج</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {isHome && <StaffNews />}
      <LicenseBanner />
      {!IS_LOCAL_APP && !offline.online && <div className="mx-auto w-full max-w-3xl px-3 pt-3"><Notice tone="warn">غير متصل — البيانات والأرصدة من آخر قراءة محفوظة{offline.cache.lastReadAt ? ` (${new Date(offline.cache.lastReadAt).toLocaleString("ar")})` : ""}، ولا تشمل العمليات المنتظرة أو تحديثات الموظفين الآخرين.</Notice></div>}

      <main className="mx-auto min-w-0 w-full max-w-3xl flex-1 px-3 py-4 pb-10 print:max-w-none print:p-0">{path === "/license" && rolesLoading ? <LoadingRows rows={3} /> : licenseDenied ? <Notice tone="info">التفعيل وأكواد التفعيل لمدير النظام فقط.</Notice> : alwaysAccessible ? children : pagePermissions.isLoading ? <LoadingRows rows={3} /> : pagePermissions.can("view") ? children : <Notice tone="info">هذه الشاشة غير مسموحة لمجموعتك. راجع مدير النظام.</Notice>}</main>
    </div>
  );
}

function usePageTitle(path: string, override?: string) {
  const [title, setTitle] = useState("");
  useEffect(() => {
    const seg = "/" + (path.split("/")[1] ?? "");
    const fromNav = NAV_GROUPS.flatMap((g) => g.items as readonly { to: string; label: string }[]).find((i) => i.to === seg)?.label;
    const read = () => setTitle(override || fromNav || (document.title.split("—")[0] ?? "").trim());
    read();
    const t = window.setTimeout(read, 150);
    return () => window.clearTimeout(t);
  }, [path, override]);
  return title;
}
