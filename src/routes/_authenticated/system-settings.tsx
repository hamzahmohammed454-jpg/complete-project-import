import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { confirmOperation } from "@/lib/operation-confirmation";
import { useSettingRows } from "@/hooks/use-system-settings";
import { useAppRoles } from "@/hooks/use-app-roles";
import { SETTINGS_TREE, resolveSetting, type SettingItem, type SettingScope, type SettingValue } from "@/lib/system-settings";

export const Route = createFileRoute("/_authenticated/system-settings")({
  head: () => ({
    meta: [
      { title: "إعدادات النظام — ابو طه للصرافة" },
      { name: "description", content: "إعدادات النظام على مستوى الفرع والمستخدم: عام، الحسابات، الحوالات، الشيكات، البيع والشراء، الرسائل." },
      { property: "og:title", content: "إعدادات النظام — ابو طه للصرافة" },
      { property: "og:description", content: "التحكم بسلوك النظام لكل فرع ولكل مستخدم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemSettings,
});

const selectCls = "w-full rounded-lg border border-border bg-background p-2 text-sm";

function SystemSettings() {
  const qc = useQueryClient();
  const { isAdmin, isManager } = useAppRoles();
  const canBranch = isAdmin || isManager;
  const [section, setSection] = useState("general");
  const [scope, setScope] = useState<SettingScope>("branch");
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const { data: rows = [] } = useSettingRows();
  const { data: me } = useQuery({ queryKey: ["me-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: async () => { const { data, error } = await supabase.from("branches").select("id, branch_name").order("the_number"); if (error) throw error; return data ?? []; } });
  const { data: users = [] } = useQuery({ queryKey: ["settings-users"], queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id, full_name, username"); if (error) throw error; return data ?? []; } });

  useEffect(() => { setOwner(scope === "branch" ? "all" : (me ?? "")); }, [scope, me]);

  const sec = SETTINGS_TREE.find((x) => x.id === section)!;
  const items = (scope === "branch" ? sec.branch : sec.user).filter((i) => !search || i.label.includes(search));
  const ctx = scope === "branch" ? { branchId: owner === "all" ? null : Number(owner) } : { userId: owner };
  const saved = useMemo(() => Object.fromEntries(items.map((i) => [i.key, resolveSetting(i.key, rows, ctx)])), [items, rows, owner, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  useEffect(() => setDraft({}), [section, scope, owner]);
  const val = (i: SettingItem) => (i.key in draft ? draft[i.key] : saved[i.key]);
  const changed = Object.keys(draft).filter((k) => draft[k] !== saved[k]);
  const editable = scope === "branch" ? canBranch : canBranch || owner === me;

  const save = useMutation({
    mutationFn: async () => {
      const payload = changed.map((key) => ({ scope, owner, key, value: draft[key] as never, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from("system_settings").upsert(payload, { onConflict: "scope,owner,key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("حُفظت الإعدادات"); setDraft({}); qc.invalidateQueries({ queryKey: ["system-settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-primary p-3 text-primary-foreground">
        <Settings2 className="size-6" />
        <h1 className="text-lg font-bold">{sec.label} ({scope === "branch" ? "إعدادات الفرع" : "إعدادات المستخدم"})</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {SETTINGS_TREE.map((x) => <Button key={x.id} size="sm" variant={x.id === section ? "default" : "outline"} onClick={() => setSection(x.id)}>{x.label}</Button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={selectCls} value={scope} onChange={(e) => setScope(e.target.value as SettingScope)}>
          <option value="branch">إعدادات الفرع</option>
          <option value="user">إعدادات المستخدم</option>
        </select>
        {scope === "branch" ? (
          <select className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">كل الفروع</option>
            {branches.map((x) => <option key={x.id} value={String(x.id)}>{x.branch_name}</option>)}
          </select>
        ) : (
          <select className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canBranch}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
        )}
      </div>
      <Input placeholder="بحث في البنود" value={search} onChange={(e) => setSearch(e.target.value)} />
      {items.length === 0 && <p className="rounded-xl bg-card p-4 text-center text-sm text-muted-foreground">لا توجد بنود في هذا القسم لهذا المستوى.</p>}
      {groups.map((g) => (
        <section key={g} className="rounded-2xl bg-card shadow-card">
          <p className="border-b border-border px-4 py-2 font-bold text-primary">{g}</p>
          <div className="divide-y divide-border">
            {items.filter((i) => i.group === g).map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm">
                  {i.label}
                  {i.live && <span className="ms-2 rounded bg-positive/15 px-1.5 text-[11px] font-bold text-positive">مفعّل</span>}
                </span>
                <div className="w-40 shrink-0">
                  {i.type === "bool" ? (
                    <div className="flex justify-end"><Switch disabled={!editable} checked={val(i) === true} onCheckedChange={(v) => setDraft({ ...draft, [i.key]: v })} /></div>
                  ) : i.type === "select" ? (
                    <select disabled={!editable} className={selectCls} value={String(val(i))} onChange={(e) => setDraft({ ...draft, [i.key]: e.target.value })}>{i.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <Input disabled={!editable} type={i.type === "number" ? "number" : i.type === "color" ? "color" : "text"} className="ledger-figures" value={String(val(i))} onChange={(e) => setDraft({ ...draft, [i.key]: i.type === "number" ? Number(e.target.value) : e.target.value })} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="sticky bottom-2 grid grid-cols-2 gap-2">
        <Button size="lg" disabled={!editable || changed.length === 0 || save.isPending} onClick={() => confirmOperation(`حفظ ${changed.length} إعداد`, () => save.mutate())}>موافق ({changed.length})</Button>
        <Button size="lg" variant="outline" disabled={changed.length === 0} onClick={() => setDraft({})}>إلغاء الأمر</Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">البنود المعلّمة «مفعّل» تتحكم فعلياً بالنظام الآن، والباقي يُحفظ ويُربط تدريجياً.</p>
    </div>
  );
}
