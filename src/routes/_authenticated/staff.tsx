import { confirmOperation } from "@/lib/operation-confirmation";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormCard, ListItem, LoadingRows, Notice, selectCls } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { createStaff, updateStaffProfile } from "@/lib/staff.functions";
import type { AppRole } from "@/lib/roles";
import { StaffWorkFields, type StaffWorkFieldsValue } from "@/components/staff-work-fields";
import type { WorkDefaults } from "@/lib/staff-defaults";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [
    { title: "دليل المستخدمين — ابو طه للصرافة" },
    { name: "description", content: "إدارة مستخدمي الصرافة وأدوارهم وصناديقهم وعملاتهم الافتراضية." },
    { property: "og:title", content: "دليل المستخدمين — ابو طه للصرافة" },
    { property: "og:description", content: "إدارة مستخدمي الصرافة وأدوارهم وصناديقهم وعملاتهم الافتراضية." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: StaffScreen,
});

const ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "مدير النظام" },
  { value: "manager", label: "مدير الفرع" },
  { value: "accountant", label: "محاسب" },
  { value: "teller", label: "صراف (كاشير)" },
];

function StaffScreen() {
  const qc = useQueryClient();
  const { roles: myRoles, isLoading: rl } = useAppRoles();
  const isAdmin = myRoles.includes("admin");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    enabled: isAdmin,
    queryFn: async () => {
      const [p, r, defaults] = await Promise.all([
        supabase.from("profiles").select("id, username, full_name, phone, branch_name").order("created_at"),
        supabase.from("user_roles").select("id, user_id, role"),
        supabase.from("staff_work_defaults").select("user_id, branch_id, box_id, currency_id, enforce_box, enforce_currency, allow_past_date, allow_future_date, allow_buy, allow_sell, boxes(box_name), currencies(currency_name), branches(branch_name)"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      if (defaults.error) throw defaults.error;
      return { people: p.data ?? [], roles: r.data ?? [], defaults: defaults.data ?? [] };
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, role, has }: { userId: string; role: AppRole; has: boolean }) => {
      const res = has
        ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
        : await supabase.from("user_roles").insert({ user_id: userId, role });
      if (res.error) throw res.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["app_roles"] }); qc.invalidateQueries({ queryKey: ["screen-access"] }); qc.invalidateQueries({ queryKey: ["screen-permissions"] }); },
    onError: () => toast.error("تعذّر تعديل الصلاحية"),
  });

  if (rl) return <LoadingRows rows={2} />;
  if (!isAdmin) return <Notice tone="info">إدارة الموظفين والصلاحيات متاحة لمدير النظام فقط.</Notice>;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="دليل المستخدمين" subtitle="المستخدمون والأدوار وإعدادات العمل." />
      <div className="mb-4">
        <Button onClick={() => setOpen((v) => !v)}>{open ? <X /> : <Plus />}{open ? "إغلاق" : "إضافة مستخدم"}</Button>
      </div>
      {open && <NewStaffForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); }} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <ul className="space-y-2">
          {data?.people.map((p) => {
            const mine = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role as AppRole);
            const defaults = data.defaults.find((d) => d.user_id === p.id);
            return (
              <ListItem key={p.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.full_name || "بدون اسم"}</p>
                    {p.branch_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.branch_name}</p>}
                  </div>
                  <span dir="ltr" className="shrink-0 text-xs text-muted-foreground">{p.username}</span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-2 border-t border-border pt-3">
                  <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                    <span>الفرع: {(defaults?.branches?.branch_name ?? p.branch_name) || "غير محدد"}</span>
                    <span>الصندوق: {defaults?.boxes?.box_name ?? "غير محدد"}</span>
                    <span>العملة: {defaults?.currencies?.currency_name ?? "غير محددة"}</span>
                  </div>
                  <Button variant="outline" size="icon" aria-label={`إعدادات عمل ${p.username}`} title="إعدادات العمل" onClick={() => setEditing(editing === p.id ? null : p.id)}><Pencil /></Button>
                </div>
                {editing === p.id && <><StaffProfileForm person={p} /><WorkDefaultsForm userId={p.id} initial={defaults} onDone={() => setEditing(null)} /></>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const has = mine.includes(r.value);
                    return (
                      <Button
                        key={r.value}
                        type="button"
                        disabled={toggle.isPending}
                        variant={has ? "default" : "outline"}
                        size="sm"
                        aria-pressed={has}
                        onClick={() => confirmOperation(`${has ? "إزالة" : "منح"} دور ${r.label} للمستخدم ${p.full_name}`, () => toggle.mutate({ userId: p.id, role: r.value, has }))}
                        className={"rounded-full border px-3 py-1 text-xs " + (has ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                      >
                        {r.label}
                      </Button>
                    );
                  })}
                </div>
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function StaffProfileForm({ person }: { person: { id: string; full_name: string; phone: string; branch_name: string } }) {
  const qc = useQueryClient();
  const update = useServerFn(updateStaffProfile);
  const [value, setValue] = useState({ full_name: person.full_name, phone: person.phone, branch_name: person.branch_name, password: "" });
  const save = useMutation({ mutationFn: () => update({ data: { user_id: person.id, full_name: value.full_name, phone: value.phone, branch_name: value.branch_name, ...(value.password ? { password: value.password } : {}) } }), onSuccess: () => { setValue((v) => ({ ...v, password: "" })); qc.invalidateQueries({ queryKey: ["staff"] }); toast.success("حُفظت بيانات المستخدم"); }, onError: () => toast.error("تعذّر حفظ بيانات المستخدم") });
  return <form className="mt-3 space-y-3 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); confirmOperation("حفظ بيانات وإعدادات المستخدم", () => save.mutate()); }}>
    <Field label="الاسم الكامل"><Input required value={value.full_name} onChange={(e) => setValue({ ...value, full_name: e.target.value })} /></Field>
    <Field label="الهاتف"><Input value={value.phone} onChange={(e) => setValue({ ...value, phone: e.target.value })} /></Field>
    <Field label="اسم الفرع"><Input value={value.branch_name} onChange={(e) => setValue({ ...value, branch_name: e.target.value })} /></Field>
    <Field label="كلمة مرور جديدة"><Input type="password" autoComplete="new-password" minLength={8} value={value.password} onChange={(e) => setValue({ ...value, password: e.target.value })} placeholder="اتركها فارغة للإبقاء على الحالية" /></Field>
    <Button type="submit" size="sm" disabled={save.isPending}><Save />حفظ بيانات المستخدم</Button>
  </form>;
}

function NewStaffForm({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createStaff);
  const [f, setF] = useState({ username: "", password: "", full_name: "", phone: "", branch_name: "", role: "teller" as AppRole });
  const [work, setWork] = useState<StaffWorkFieldsValue>({ branch_id: "", box_id: "", currency_id: "", enforce_box: false, enforce_currency: false, allow_past_date: true, allow_future_date: true, allow_buy: true, allow_sell: true });
  const m = useMutation({
    mutationFn: () => create({ data: { ...f, enforce_box: work.enforce_box, enforce_currency: work.enforce_currency, allow_past_date: work.allow_past_date, allow_future_date: work.allow_future_date, allow_buy: work.allow_buy, allow_sell: work.allow_sell, branch_id: work.branch_id ? Number(work.branch_id) : null, box_id: work.box_id ? Number(work.box_id) : null, currency_id: work.currency_id ? Number(work.currency_id) : null } }),
    onSuccess: () => { toast.success("أُضيف الموظف ويمكنه الدخول الآن"); onDone(); },
    onError: (e: Error) => toast.error(e.message.includes("EXISTS") ? "اسم المستخدم مستخدم لموظف آخر" : "تعذّر الإضافة — اسم المستخدم ٣ أحرف إنجليزية على الأقل وكلمة المرور ٨"),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="الاسم الكامل">
        <Input required placeholder="مثال: أحمد محمد" value={f.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="اسم المستخدم">
        <Input required dir="ltr" placeholder="حروف إنجليزية وأرقام" value={f.username} onChange={set("username")} />
      </Field>
      <Field label="كلمة المرور">
        <Input type="password" autoComplete="new-password" required minLength={8} dir="ltr" placeholder="٨ أحرف على الأقل" value={f.password} onChange={set("password")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الهاتف">
          <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.phone} onChange={set("phone")} className="ledger-figures" />
        </Field>
        <Field label="الفرع">
          <Input placeholder="اسم الفرع" value={f.branch_name} onChange={set("branch_name")} />
        </Field>
      </div>
      <StaffWorkFields value={work} onChange={setWork} />
      <Field label="الدور">
        <select className={selectCls} value={f.role} onChange={set("role")}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      <Button type="submit" disabled={m.isPending || (work.enforce_box && !work.box_id) || (work.enforce_currency && !work.currency_id)}>حفظ</Button>
    </FormCard>
  );
}

function WorkDefaultsForm({ userId, initial, onDone }: { userId: string; initial: WorkDefaults | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<StaffWorkFieldsValue>({ branch_id: initial?.branch_id ? String(initial.branch_id) : "", box_id: initial?.box_id ? String(initial.box_id) : "", currency_id: initial?.currency_id ? String(initial.currency_id) : "", enforce_box: initial?.enforce_box ?? false, enforce_currency: initial?.enforce_currency ?? false, allow_past_date: initial?.allow_past_date ?? true, allow_future_date: initial?.allow_future_date ?? true, allow_buy: initial?.allow_buy ?? true, allow_sell: initial?.allow_sell ?? true });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("staff_work_defaults").upsert({ user_id: userId, enforce_box: value.enforce_box, enforce_currency: value.enforce_currency, allow_past_date: value.allow_past_date, allow_future_date: value.allow_future_date, allow_buy: value.allow_buy, allow_sell: value.allow_sell, branch_id: value.branch_id ? Number(value.branch_id) : null, box_id: value.box_id ? Number(value.box_id) : null, currency_id: value.currency_id ? Number(value.currency_id) : null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["my-work-defaults"] }); toast.success("حُفظت إعدادات العمل"); onDone(); },
    onError: () => toast.error("تعذّر الحفظ — تأكد من الفرع والصندوق وصلاحيتك"),
  });
  return <form className="mt-3 space-y-3 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); confirmOperation("حفظ بيانات وإعدادات المستخدم", () => save.mutate()); }}>
    <StaffWorkFields value={value} onChange={setValue} />
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={save.isPending || (value.enforce_box && !value.box_id) || (value.enforce_currency && !value.currency_id)}><Save />حفظ إعدادات العمل</Button><Button type="button" variant="outline" size="sm" onClick={onDone}>إلغاء</Button></div>
  </form>;
}
