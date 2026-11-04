import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Home, Settings2 } from "lucide-react";
import { NAV_GROUPS, TAB_OF, navigationSections } from "@/lib/nav-groups";

export function WorkspaceNavigation({ path, canSee, onNavigate }: { path: string; canSee: (path: string) => boolean; onNavigate?: () => void }) {
  const activeTab = TAB_OF["/" + (path.split("/")[1] ?? "")];
  return <nav aria-label="قائمة النظام" className="space-y-1 p-3">
    <Link to="/app" onClick={onNavigate} aria-current={path === "/app" ? "page" : undefined} className={"flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold " + (path === "/app" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent")}><Home className="size-5 shrink-0" />الرئيسية</Link>
    {NAV_GROUPS.map((group) => {
      const sections = navigationSections(group.tab).map((section) => ({ ...section, items: section.items.filter((item) => canSee(item.to)) })).filter((section) => section.items.length || section.planned.length);
      if (!sections.some((section) => section.items.length)) return null;
      if (!sections.length) return null;
      const Icon = group.tab === "/administration" ? Settings2 : group.items[0].icon;
      return <details key={group.tab + activeTab} open={activeTab === group.tab} className="group/nav border-b border-border/60 pb-1">
        <summary className={"grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold " + (activeTab === group.tab ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent")}><Icon className="size-5 shrink-0" /><span className="min-w-0">{group.title}</span><ChevronDown className="size-4 transition-transform group-open/nav:rotate-180" /></summary>
        <div className="mt-1 space-y-1 border-r border-border pr-3 mr-5">
          {sections.map((section) => <div key={section.title}>
            <details key={section.title + path} open={section.items.some((item) => item.to === path)} className="group/section">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-accent"><span>{section.title}</span><ChevronLeft className="size-3.5 group-open/section:-rotate-90" /></summary>
              <NavigationLinks items={section.items} path={path} onNavigate={onNavigate} />
              {section.planned.length > 0 && <ul className="space-y-0.5 pb-2">{section.planned.map((label) => <li key={label} aria-disabled="true" className="flex min-w-0 items-start justify-between gap-2 rounded-md px-2 py-1.5 text-xs leading-5 text-muted-foreground/70"><span className="min-w-0">{label}</span><span className="shrink-0 rounded bg-muted px-1.5 text-[10px]">قريبًا</span></li>)}</ul>}
            </details>
          </div>)}
        </div>
      </details>;
    })}
  </nav>;
}

function NavigationLinks({ items, path, onNavigate }: { items: ReturnType<typeof navigationSections>[number]["items"]; path: string; onNavigate?: (() => void) | undefined }) {
  return <ul className="space-y-0.5 pb-2">{items.map((item) => <li key={item.to}><Link to={item.to} onClick={onNavigate} aria-current={path === item.to ? "page" : undefined} className={"flex min-w-0 items-start gap-2 rounded-md px-2 py-2 text-xs leading-5 " + (path === item.to ? "bg-accent font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}><item.icon className="mt-0.5 size-4 shrink-0" /><span className="min-w-0">{item.label}</span></Link></li>)}</ul>;
}