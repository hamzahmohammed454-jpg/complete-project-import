import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { findGroup, ICON } from "@/lib/home-groups";

export const Route = createFileRoute("/_authenticated/section/$id")({
  loader: ({ params }) => {
    const group = findGroup(params.id);
    if (!group) throw notFound();
    return { id: group.id };
  },
  head: ({ loaderData }) => {
    const title = `${(loaderData ? findGroup(loaderData.id)?.title : undefined) ?? "قسم"} — ابو طه للصرافة`;
    return { meta: [{ title }, { name: "description", content: "شاشات هذا القسم من نظام الصرافة." }, { property: "og:title", content: title }, { property: "og:description", content: "شاشات هذا القسم من نظام الصرافة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: SectionScreen,
});

function SectionScreen() {
  const { id } = Route.useLoaderData();
  const g = findGroup(id)!;
  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <Link to={g.parent ? "/section/$id" : "/app"} params={g.parent ? { id: g.parent } : undefined as never} aria-label="رجوع" className="grid size-10 place-items-center rounded-xl text-foreground"><ArrowRight className="size-6" /></Link>
        <h1 className="display flex-1 text-xl font-bold text-foreground">{g.title}</h1>
      </div>
      <ul className="grid gap-3">
        {g.tiles.map((t) => (
          <li key={t.to + t.label}>
            <Link to={t.to} search={t.search as never} className="flex items-center gap-4 rounded-2xl bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted">
                <img src={ICON(t.img)} alt="" width={40} height={40} className="size-9 object-contain" />
              </span>
              <span className="text-base font-medium text-foreground">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
