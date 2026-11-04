import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Users, ShieldCheck, Building2 } from "lucide-react";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { LoadingRows, Notice } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { groupItems } from "@/lib/nav-groups";

export const Route = createFileRoute("/_authenticated/administration")({
  head: () => ({ meta: [
    { title: "الأدوات الإدارية — ابو طه للصرافة" },
    { name: "description", content: "إدارة مستخدمي النظام ومجموعاتهم وصلاحياتهم والفروع وإعدادات العمل." },
    { property: "og:title", content: "الأدوات الإدارية — ابو طه للصرافة" },
    { property: "og:description", content: "إدارة مستخدمي النظام ومجموعاتهم وصلاحياتهم والفروع وإعدادات العمل." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AdministrationScreen,
});

function AdministrationScreen() {
  const { isAdmin, isLoading } = useAppRoles();
  if (isLoading) return <LoadingRows rows={3} />;
  if (!isAdmin) return <Notice tone="info">الأدوات الإدارية متاحة لمدير النظام فقط.</Notice>;
  return <>
    <SectionIntro title="الأدوات الإدارية" subtitle="إدارة النظام" />
    <h2 className="mb-3 text-sm font-semibold">المستخدمون والأمان</h2>
    <div className="mb-7 grid gap-2">
      <ToolLink to="/staff" icon={Users} label="دليل المستخدمين" detail="المستخدمون · الأدوار · الصندوق والعملة" />
      <ToolLink to="/setup" search={{ section: "usergroups" }} icon={ShieldCheck} label="مجموعات المستخدمين والصلاحيات" detail="المجموعات · الشاشات المسموحة · الأعضاء" />
    </div>
    <h2 className="mb-3 text-sm font-semibold">التهيئة والتقارير</h2>
    <div className="grid gap-2">
      <ToolLink to="/setup" search={{ section: "branches" }} icon={Building2} label="الفروع والتهيئة" />
      {groupItems("/administration").filter((i) => i.to === "/backup" || i.to === "/activity" || i.to === "/news" || i.to === "/license").map((i) => <ToolLink key={i.to} to={i.to} icon={i.icon} label={i.label} />)}
    </div>
  </>;
}

function ToolLink({ to, search, icon: Icon, label, detail }: { to: "/staff" | "/setup" | "/backup" | "/activity" | "/news" | "/license"; search?: { section: "usergroups" | "branches" }; icon: typeof Users; label: string; detail?: string }) {
  return <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-lg bg-card px-4 py-4 text-start">
    <Link to={to} search={search ?? {}}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1 whitespace-normal"><span className="block text-sm font-semibold">{label}</span>{detail && <span className="mt-1 block text-xs font-normal text-muted-foreground">{detail}</span>}</span>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  </Button>;
}