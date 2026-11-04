import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, FileText, Folder, FolderOpen, Lock, Minus, RotateCcw, Search, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { PendingNote } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingRows, Notice } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import type { ScreenPermission } from "@/lib/permissions";
import {
  LOCKED_SCREENS, PERMISSION_TREE, defaultRow, isOn, permKeys, sameRow, screenLabel, setAll, setKey, stateOf, userEffectiveRow,
  type CheckState, type GroupSource,
} from "@/lib/permission-tree";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — ابو طه للصرافة" }, { name: "description", content: "تحديد صلاحيات كل مجموعة مستخدمين أو كل موظف على أقسام النظام وشاشاته وعملياته." }, { property: "og:title", content: "الصلاحيات — ابو طه للصرافة" }, { property: "og:description", content: "صلاحيات المجموعات والموظفين على كل شاشة وعملية في النظام." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { g?: number; u?: string; m?: "user" } => {
    const out: { g?: number; u?: string; m?: "user" } = {};
    const g = Number(s["g"]);
    if (Number.isInteger(g) && g > 0) out.g = g;
    if (typeof s["u"] === "string" && /^[0-9a-f-]{36}$/i.test(s["u"])) out.u = s["u"];
    if (s["m"] === "user") out.m = "user";
    return out;
  },
  component: PermissionsScreen,
});

type Group = { id: number; the_number: number; group_name: string; allowed_screens: string[] };
type Person = { id: string; username: string | null; full_name: string | null };

const toPerm = (r: { screen_path: string; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean; can_print: boolean; extra_actions: unknown }): ScreenPermission => ({
  screen_path: r.screen_path, can_view: r.can_view, can_create: r.can_create, can_update: r.can_update, can_delete: r.can_delete, can_print: r.can_print,
  extra_actions: (r.extra_actions ?? {}) as Record<string, boolean>,
});
const personName = (p: Person | undefined) => (p ? p.full_name || p.username || "—" : "—");

function PermissionsScreen() {
  const { roles, isLoading } = useAppRoles();
  if (isLoading) return <LoadingRows rows={4} />;
  if (!roles.includes("admin")) return <PendingNote text="تعديل الصلاحيات لمدير النظام فقط." />;
  return <PermissionsEditor />;
}

function useGroups() {
  return useQuery({
    queryKey: ["user_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_groups").select("id, the_number, group_name, allowed_screens, notes").order("the_number");
      if (error) throw error;
      return data as Group[];
    },
  });
}

function PermissionsEditor() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [dirty, setDirty] = useState(false);
  const byUser = search.m === "user";

  const go = async (next: { g?: number; u?: string; m?: "user" }) => {
    if (dirty && !await confirmAsk("لم تحفظ التغييرات. تتركها وتنتقل؟")) return;
    setDirty(false);
    navigate({ search: next, replace: true });
  };

  return (
    <div className="space-y-3 pb-24">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        {([["group", "صلاحيات مجموعة", Users], ["user", "صلاحيات موظف", UserRound]] as const).map(([k, label, Icon]) => {
          const on = (k === "user") === byUser;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => !on && go(k === "user" ? { m: "user" } : {})}
              className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
      {byUser
        ? <UserMode selectedId={search.u} onPick={(u) => go({ m: "user", u })} onDirty={setDirty} />
        : <GroupMode selectedId={search.g} onPick={(g) => go({ g })} onDirty={setDirty} />}
    </div>
  );
}

function Chips<T extends string | number>({ title, items, selected, onPick }: { title: string; items: { id: T; label: string; note?: string }[]; selected: T | undefined; onPick: (id: T) => void }) {
  return (
    <>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((x) => (
          <button
            key={String(x.id)}
            type="button"
            onClick={() => x.id !== selected && onPick(x.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              x.id === selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {x.label}{x.note ? <span className="ms-1 text-[11px] opacity-75">({x.note})</span> : null}
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ group mode

function GroupMode({ selectedId, onPick, onDirty }: { selectedId: number | undefined; onPick: (id: number) => void; onDirty: (d: boolean) => void }) {
  const groups = useGroups();
  const list = groups.data ?? [];
  const selected = list.find((x) => x.id === selectedId) ?? list[0];

  if (groups.isLoading) return <LoadingRows rows={4} />;
  if (groups.isError) return <Button variant="outline" onClick={() => groups.refetch()}>إعادة المحاولة</Button>;
  if (list.length === 0)
    return <EmptyState icon={Users} title="لا توجد مجموعات مستخدمين بعد" hint="أضف مجموعة من «دليل مجموعات المستخدمين» ثم ارجع هنا لتحديد صلاحياتها." />;

  return (
    <>
      <Notice tone="info">اختر المجموعة، ثم أشّر على ما تسمح به. مدير النظام يملك كل الصلاحيات دائمًا.</Notice>
      <section className="rounded-2xl border border-border bg-card p-3">
        <Chips title="اختر مجموعة" items={list.map((x) => ({ id: x.id, label: x.group_name }))} selected={selected?.id} onPick={onPick} />
        {selected && <GroupMembersLine groupId={selected.id} />}
      </section>
      {selected && <GroupTree key={selected.id} group={selected} onDirty={onDirty} />}
    </>
  );
}

function GroupMembersLine({ groupId }: { groupId: number }) {
  const q = useQuery({
    queryKey: ["group-members-names", groupId],
    queryFn: async () => {
      const { data: m, error } = await supabase.from("user_group_members").select("user_id").eq("group_id", groupId);
      if (error) throw error;
      const ids = (m ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as string[];
      const { data: p, error: e2 } = await supabase.from("profiles").select("id, full_name, username").in("id", ids);
      if (e2) throw e2;
      return (p ?? []).map((r) => r.full_name || r.username || "—");
    },
  });
  return (
    <div className="mt-3 border-t border-border pt-2 text-xs">
      <span className="font-semibold text-muted-foreground">المستخدمون في المجموعة: </span>
      {q.isLoading ? "…" : q.data && q.data.length > 0 ? q.data.join("، ") : <span className="text-muted-foreground">لا أحد بعد — أضفهم من «دليل مجموعات المستخدمين».</span>}
    </div>
  );
}

function GroupTree({ group, onDirty }: { group: Group; onDirty: (d: boolean) => void }) {
  const qc = useQueryClient();
  const stored = useQuery({
    queryKey: ["group-permissions", group.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_screen_permissions").select("*").eq("group_id", group.id);
      if (error) throw error;
      return data.map(toPerm);
    },
  });

  const base = useMemo(() => {
    const out: Record<string, ScreenPermission> = {};
    for (const s of ALL_SCREENS) out[s] = stored.data?.find((p) => p.screen_path === s) ?? defaultRow(s, group.allowed_screens ?? []);
    return out;
  }, [stored.data, group.allowed_screens]);

  if (stored.isLoading) return <LoadingRows rows={5} />;
  if (stored.isError) return <Button variant="outline" onClick={() => stored.refetch()}>إعادة المحاولة</Button>;

  return (
    <PermTree
      title={`الصلاحيات — ${group.group_name}`}
      base={base}
      onDirty={onDirty}
      onSave={async (rows) => {
        const { error } = await supabase.from("group_screen_permissions").upsert(rows.map((r) => ({ group_id: group.id, ...r })), { onConflict: "group_id,screen_path" });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["group-permissions", group.id] });
        qc.invalidateQueries({ queryKey: ["user-permission-sources"] });
      }}
    />
  );
}

// ------------------------------------------------------------------- user mode

function UserMode({ selectedId, onPick, onDirty }: { selectedId: string | undefined; onPick: (id: string) => void; onDirty: (d: boolean) => void }) {
  const people = useQuery({
    queryKey: ["permission-people"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, username, full_name").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const admins = new Set((r.data ?? []).filter((x) => x.role === "admin").map((x) => x.user_id));
      return (p.data as Person[]).map((x) => ({ ...x, isAdmin: admins.has(x.id) }));
    },
  });
  const list = people.data ?? [];
  const staff = list.filter((x) => !x.isAdmin);
  const selected = staff.find((x) => x.id === selectedId) ?? staff[0];

  if (people.isLoading) return <LoadingRows rows={4} />;
  if (people.isError) return <Button variant="outline" onClick={() => people.refetch()}>إعادة المحاولة</Button>;
  if (staff.length === 0)
    return <EmptyState icon={UserRound} title="لا يوجد موظفون بعد" hint="أضف الموظفين من شاشة «دليل المستخدمين» ثم ارجع هنا لتحديد صلاحيات كل واحد." />;

  return (
    <>
      <Notice tone="info">صلاحيات الموظف الخاصة تحل محل صلاحيات مجموعته في الشاشات التي تغيّرها فقط. باقي الشاشات تبقى حسب المجموعة.</Notice>
      <section className="rounded-2xl border border-border bg-card p-3">
        <Chips title="اختر موظفًا" items={staff.map((x) => ({ id: x.id, label: personName(x) }))} selected={selected?.id} onPick={onPick} />
        {list.some((x) => x.isAdmin) && (
          <p className="mt-2 text-[11px] text-muted-foreground">مدير النظام غير ظاهر هنا لأنه يملك كل الصلاحيات دائمًا.</p>
        )}
      </section>
      {selected && <UserTree key={selected.id} person={selected} onDirty={onDirty} />}
    </>
  );
}

function UserTree({ person, onDirty }: { person: Person; onDirty: (d: boolean) => void }) {
  const qc = useQueryClient();
  const groups = useGroups();
  const sources = useQuery({
    queryKey: ["user-permission-sources", person.id],
    queryFn: async () => {
      const [m, own] = await Promise.all([
        supabase.from("user_group_members").select("group_id").eq("user_id", person.id),
        supabase.from("user_screen_permissions").select("*").eq("user_id", person.id),
      ]);
      if (m.error) throw m.error;
      if (own.error) throw own.error;
      const ids = (m.data ?? []).map((r) => r.group_id);
      let groupRows: (ScreenPermission & { group_id: number })[] = [];
      if (ids.length > 0) {
        const { data, error } = await supabase.from("group_screen_permissions").select("*").in("group_id", ids);
        if (error) throw error;
        groupRows = data.map((r) => ({ ...toPerm(r), group_id: r.group_id }));
      }
      return { groupIds: ids, groupRows, personal: (own.data ?? []).map(toPerm) };
    },
  });

  const myGroups = useMemo(() => (groups.data ?? []).filter((g) => sources.data?.groupIds.includes(g.id)), [groups.data, sources.data]);
  const base = useMemo(() => {
    const src: GroupSource[] = myGroups.map((g) => ({ allowed_screens: g.allowed_screens ?? [], rows: (sources.data?.groupRows ?? []).filter((r) => r.group_id === g.id) }));
    const out: Record<string, ScreenPermission> = {};
    for (const s of ALL_SCREENS) out[s] = userEffectiveRow(s, sources.data?.personal ?? [], src);
    return out;
  }, [sources.data, myGroups]);
  const overridden = useMemo(() => new Set((sources.data?.personal ?? []).map((r) => r.screen_path)), [sources.data]);

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_screen_permissions").delete().eq("user_id", person.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-permission-sources", person.id] });
      toast.success("رجعت صلاحيات الموظف حسب مجموعته");
    },
    onError: () => toast.error("تعذّر الإرجاع — تأكد من الاتصال وحاول مرة أخرى"),
  });

  if (sources.isLoading || groups.isLoading) return <LoadingRows rows={5} />;
  if (sources.isError || groups.isError) return <Button variant="outline" onClick={() => { sources.refetch(); groups.refetch(); }}>إعادة المحاولة</Button>;

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-3 text-xs">
        <p>
          <span className="font-semibold text-muted-foreground">مجموعاته: </span>
          {myGroups.length ? myGroups.map((g) => g.group_name).join("، ") : <span className="text-muted-foreground">بدون مجموعة — مسموح له كل الشاشات ما لم تمنعها هنا.</span>}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <span>
            <span className="font-semibold text-muted-foreground">شاشات بصلاحية خاصة: </span>
            <span className="ledger-figures">{overridden.size}</span>
          </span>
          {overridden.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={reset.isPending}
              onClick={async () => { if (await confirmAsk(`إلغاء كل الصلاحيات الخاصة لـ ${personName(person)} وإرجاعه لصلاحيات مجموعته؟`)) reset.mutate(); }}
            >
              <RotateCcw className="h-4 w-4" />
              إرجاع لصلاحيات المجموعة
            </Button>
          )}
        </div>
      </section>
      <PermTree
        key={[...overridden].join(",")}
        title={`صلاحيات — ${personName(person)}`}
        base={base}
        overridden={overridden}
        onDirty={onDirty}
        onSave={async (rows) => {
          const { error } = await supabase.from("user_screen_permissions").upsert(rows.map((r) => ({ user_id: person.id, ...r })), { onConflict: "user_id,screen_path" });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: ["user-permission-sources", person.id] });
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------- the tree

const ALL_SCREENS = PERMISSION_TREE.flatMap((x) => x.screens);

function PermTree({
  title, base, overridden, onDirty, onSave,
}: {
  title: string;
  base: Record<string, ScreenPermission>;
  overridden?: ReadonlySet<string>;
  onDirty: (d: boolean) => void;
  onSave: (rows: ScreenPermission[]) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, ScreenPermission>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ root: true });
  const rowOf = (p: string) => edits[p] ?? base[p]!;
  const changed = Object.keys(edits).filter((p) => !sameRow(edits[p]!, base[p]!));

  const apply = (next: Record<string, ScreenPermission>) => {
    const merged = { ...edits, ...next };
    setEdits(merged);
    onDirty(Object.keys(merged).some((p) => !sameRow(merged[p]!, base[p]!)));
  };
  const toggleScreens = (paths: readonly string[], on: boolean) =>
    apply(Object.fromEntries(paths.filter((p) => !LOCKED_SCREENS.includes(p)).map((p) => [p, setAll(rowOf(p), on)])));

  const save = useMutation({
    mutationFn: async () => {
      const rows = changed.map((p) => edits[p]!);
      if (rows.length === 0) return;
      await onSave(rows);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screen-permissions"] });
      qc.invalidateQueries({ queryKey: ["screen-access"] });
      setEdits({});
      onDirty(false);
      toast.success("حُفظت الصلاحيات");
    },
    onError: () => toast.error("تعذّر حفظ الصلاحيات — تأكد من الاتصال وحاول مرة أخرى"),
  });

  const q = query.trim();
  const matches = (p: string) => !q || screenLabel(p).includes(q) || permKeys(p).some((k) => k.label.includes(q));
  const sections = PERMISSION_TREE.map((s) => ({ ...s, shown: s.screens.filter(matches) })).filter((s) => s.shown.length > 0);
  const editable = (paths: readonly string[]) => paths.filter((p) => !LOCKED_SCREENS.includes(p));
  const allPaths = editable(ALL_SCREENS);
  const isOpen = (id: string) => (q ? true : open[id] === true);
  const flip = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن شاشة أو عملية…" className="pe-9" />
      </div>

      <section className="rounded-2xl border border-border bg-card p-2">
        <NodeRow
          depth={0}
          icon={isOpen("root") ? FolderOpen : Folder}
          label={title}
          bold
          state={stateOf(allPaths.map(rowOf))}
          expanded={isOpen("root")}
          onExpand={() => flip("root")}
          onCheck={(on) => toggleScreens(allPaths, on)}
        />
        {isOpen("root") && sections.map((s) => (
          <div key={s.id}>
            <NodeRow
              depth={1}
              icon={isOpen(s.id) ? FolderOpen : Folder}
              label={s.label}
              bold
              state={stateOf(editable(s.screens).map(rowOf))}
              expanded={isOpen(s.id)}
              onExpand={() => flip(s.id)}
              onCheck={(on) => toggleScreens(s.screens, on)}
            />
            {isOpen(s.id) && s.shown.map((p) => {
              if (LOCKED_SCREENS.includes(p))
                return <NodeRow key={p} depth={2} icon={Lock} label={`${screenLabel(p)} — للمدير فقط`} state="none" disabled />;
              const row = rowOf(p);
              const id = `${s.id}${p}`;
              return (
                <div key={p}>
                  <NodeRow
                    depth={2}
                    icon={FileText}
                    label={screenLabel(p)}
                    badge={overridden?.has(p) ? "خاص" : undefined}
                    state={stateOf([row])}
                    expanded={isOpen(id)}
                    onExpand={() => flip(id)}
                    onCheck={(on) => apply({ [p]: setAll(row, on) })}
                  />
                  {isOpen(id) && (
                    <div className="mb-1 ms-14 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-muted/50 p-2 sm:grid-cols-3">
                      {permKeys(p).map((k) => {
                        const on = isOn(row, k.key);
                        return (
                          <div key={k.key} className="flex items-center gap-2 text-sm">
                            <TriCheck state={on ? "all" : "none"} label={`${k.label} ${screenLabel(p)}`} onChange={(v) => apply({ [p]: setKey(row, k.key, v) })} />
                            <button type="button" tabIndex={-1} onClick={() => apply({ [p]: setKey(row, k.key, !on) })} className={cn("min-w-0 text-start", !on && "text-muted-foreground")}>{k.label}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {sections.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد شاشة بهذا الاسم.</p>}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        إضافة الموظفين للمجموعات من{" "}
        <Link to="/setup" search={{ section: "usergroups" }} className="font-semibold text-primary underline-offset-2 hover:underline">دليل مجموعات المستخدمين</Link>
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button className="flex-1" disabled={changed.length === 0 || save.isPending} onClick={() => confirmOperation("حفظ الصلاحيات", () => save.mutate())}>
            {save.isPending ? "جارٍ الحفظ…" : changed.length ? `حفظ (${changed.length} شاشة)` : "حفظ"}
          </Button>
          <Button variant="outline" disabled={changed.length === 0 || save.isPending} onClick={() => { setEdits({}); onDirty(false); }}>
            تراجع
          </Button>
        </div>
      </div>
    </>
  );
}

function NodeRow({
  depth, icon: Icon, label, state, bold, expanded, onExpand, onCheck, disabled, badge,
}: {
  depth: number;
  badge?: string | undefined;
  icon: typeof Folder;
  label: string;
  state: CheckState;
  bold?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  onCheck?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-muted/40" style={{ paddingInlineStart: `${depth * 18 + 4}px` }}>
      {onExpand ? (
        <button type="button" onClick={onExpand} aria-label={expanded ? `إغلاق ${label}` : `فتح ${label}`} className="grid h-7 w-7 shrink-0 place-content-center rounded-md text-muted-foreground hover:bg-muted">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      ) : <span className="w-7 shrink-0" />}
      <TriCheck state={state} label={label} disabled={disabled} onChange={(v) => onCheck?.(v)} />
      <Icon className={cn("h-5 w-5 shrink-0", Icon === FileText || Icon === Lock ? "text-primary" : "text-accent")} />
      <button type="button" onClick={onExpand} disabled={!onExpand} className={cn("min-w-0 flex-1 truncate text-start text-sm", bold && "font-semibold", disabled && "text-muted-foreground")}>
        {label}
      </button>
      {badge && <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">{badge}</span>}
    </div>
  );
}

function TriCheck({ state, label, onChange, disabled }: { state: CheckState; label: string; onChange: (on: boolean) => void; disabled?: boolean | undefined }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(state !== "all")}
      className={cn(
        "grid h-5 w-5 shrink-0 place-content-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        state === "none" ? "border-input bg-background" : "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === "all" ? <Check className="pointer-events-none h-3.5 w-3.5" /> : state === "some" ? <Minus className="pointer-events-none h-3.5 w-3.5" /> : null}
    </button>
  );
}
