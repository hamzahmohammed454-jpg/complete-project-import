import { Link, useRouterState } from "@tanstack/react-router";

import { IconTile } from "@/components/ui-kit";
import { useScreenAccess } from "@/hooks/use-screen-access";
import { NAV_GROUPS, TAB_OF, type NavTab } from "@/lib/nav-groups";

/**
 * شريط قائمة التبويب: شاشات القائمة التي أنت داخلها، لتنتقل بينها من أي شاشة.
 * لا يظهر إذا كانت القائمة شاشة واحدة أو إذا كانت القيود أخفت بقيتها.
 */
export function MenuStrip(_props: { tab?: NavTab }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { canSee } = useScreenAccess();
  const seg = "/" + (path.split("/")[1] ?? "");

  const group = NAV_GROUPS.find((g) => g.tab === TAB_OF[seg]);
  const items = (group?.items ?? []).filter((i) => canSee(i.to));
  // نمط هولجن: لا شريط تنقل داخل الشاشات — الرجوع من سهم العنوان
  if (items.length < 2 || items.length > 0) return null;

  return (
    <nav aria-label={group?.title ?? "شاشات القائمة"} className="mb-4 -mx-4 overflow-x-auto px-4 lg:hidden print:hidden">
      <ul className="flex w-max gap-2">
        {items.map((i) => {
          const active = seg === i.to;
          const Icon = i.icon;
          return (
            <li key={i.to}>
              <Link
                to={i.to}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors " +
                  (active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card text-muted-foreground shadow-card")
                }
              >
                <IconTile icon={Icon} tone={i.tone} size="sm" className="size-6 rounded-md" />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
