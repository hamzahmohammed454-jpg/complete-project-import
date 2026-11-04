import { confirmOperation } from "@/lib/operation-confirmation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Network, Tags, Users } from "lucide-react";
import { toast } from "sonner";

import { RowActions } from "@/components/row-actions";
import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Field,
  FormCard,
  ListItem,
  LoadingRows,
  Notice,
  Segments,
  StatusPill,
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { SCREENS } from "@/lib/screen-access";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "التهيئة — ابو طه للصرافة" }, { name: "description", content: "إدارة الفروع ومجموعات الموظفين وصلاحيات العرض والإضافة والتعديل والحذف والطباعة." }, { property: "og:title", content: "التهيئة والصلاحيات — ابو طه للصرافة" }, { property: "og:description", content: "الفروع ومجموعات الموظفين وصلاحيات العمليات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (search: Record<string, unknown>): { section?: Section } => {
    const section = SECTIONS.find((s) => s.value === search["section"])?.value;
    return section ? { section } : {};
  },
  component: SetupScreen,
});

const SECTIONS = [
  { value: "branches", label: "الفروع" },
  { value: "groups", label: "مجموعات الحسابات" },
  { value: "classifications", label: "التصنيفات" },
  { value: "usergroups", label: "مجموعات الموظفين" },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

function SetupScreen() {
  const { isAdmin, isLoading } = useAppRoles();
  const { section: initialSection } = Route.useSearch();
  const [section, setSection] = useState<Section>(initialSection ?? "branches");

  if (isLoading) return <LoadingRows rows={3} />;
  if (!isAdmin)
    return (
      <>
        <MenuStrip tab="/accounts" />
        <SectionIntro title="التهيئة" subtitle="الفروع ومجموعات الحسابات والتصنيفات ومجموعات الموظفين." />
        <Notice tone="info">إدارة التهيئة متاحة لمدير النظام فقط.</Notice>
      </>
    );

  return (
    <>
      <SectionIntro title="التهيئة" subtitle="أساسيات النظام: فروعك، مجموعات الحسابات، التصنيفات، ومجموعات الموظفين." />
      <Segments options={SECTIONS} value={section} onChange={setSection} ariaLabel="أقسام التهيئة" />
      {section === "branches" && <BranchesSection />}
      {section === "groups" && <AccountGroupsSection />}
      {section === "classifications" && <ClassificationsSection />}
      {section === "usergroups" && <UserGroupsSection />}
    </>
  );
}

/** حقل ملاحظات موحّد. */
function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="ملاحظات">
      <Input placeholder="اختياري" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

// ==================== الفروع ====================

type Branch = {
  id: number;
  the_number: number;
  branch_name: string;
  english_name: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

function BranchesSection() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, the_number, branch_name, english_name, phone, address, notes")
        .order("the_number");
      if (error) throw error;
      return data as Branch[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("branches").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف الفرع");
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  return (
    <>
      <Toolbar
        search={<Input placeholder="بحث باسم الفرع" onChange={(e) => setFilter(e.target.value)} />}
        action={<Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة فرع"}</Button>}
      />
      {open && <BranchForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Building2} title="لا توجد فروع بعد" hint="أضف أول فرع لتُنسب إليه العمليات والصناديق." />
      ) : (
        <BranchList data={data} filter={filter} editing={editing} setEditing={setEditing} del={del} />
      )}
    </>
  );
}

function BranchList({
  data,
  filter,
  editing,
  setEditing,
  del,
}: {
  data: Branch[];
  filter: string;
  editing: number | null;
  setEditing: (v: number | null) => void;
  del: { isPending: boolean; mutate: (id: number) => void };
}) {
  const term = filter.trim();
  const matches = term
    ? data.filter((b) => b.branch_name.includes(term) || (b.english_name ?? "").toLowerCase().includes(term.toLowerCase()))
    : data;

  return (
    <>
      {term && matches.length === 0 && (
        <EmptyState icon={Building2} title="لا نتائج مطابقة للبحث" hint="جرّب اسم فرع آخر." />
      )}
      <ul className="space-y-2">
        {matches.map((b) => (
          <ListItem key={b.id}>
            <div className="flex items-center gap-3">
              <span className="ledger-figures shrink-0 text-sm text-primary">{b.the_number}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.branch_name}</span>
              {b.phone && <span className="ledger-figures shrink-0 text-xs text-muted-foreground">{b.phone}</span>}
            </div>
            {(b.address || b.notes) && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{b.address || b.notes}</p>
            )}
            <div className="mt-2 flex justify-end">
              <RowActions
                canEdit
                canDelete
                pending={del.isPending}
                onEdit={() => setEditing(editing === b.id ? null : b.id)}
                onDelete={() => del.mutate(b.id)}
              />
            </div>
            {editing === b.id && <BranchForm initial={b} onDone={() => setEditing(null)} />}
          </ListItem>
        ))}
      </ul>
    </>
  );
}

function BranchForm({ initial, onDone }: { initial?: Branch; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    branch_name: initial?.branch_name ?? "",
    english_name: initial?.english_name ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const m = useMutation({
    mutationFn: async () => {
      const fields = {
        branch_name: f.branch_name.trim(),
        english_name: f.english_name.trim() || null,
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        notes: f.notes.trim() || null,
      };
      if (initial) {
        const { data, error } = await supabase.from("branches").update(fields).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("branches").insert({ the_number: 0, ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيف الفرع");
      qc.invalidateQueries({ queryKey: ["branches"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الإضافة — الاسم مستخدم أو لا تملك الصلاحية"),
  });

  return (
    <FormCard className={initial ? "mt-3 mb-0" : undefined} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم الفرع">
        <Input required placeholder="مثال: الفرع الرئيسي — التواهي" value={f.branch_name} onChange={set("branch_name")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الاسم بالإنجليزية">
          <Input dir="ltr" placeholder="Optional" value={f.english_name} onChange={set("english_name")} />
        </Field>
        <Field label="الهاتف">
          <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.phone} onChange={set("phone")} className="ledger-figures" />
        </Field>
      </div>
      <Field label="العنوان">
        <Input placeholder="المدينة / الشارع" value={f.address} onChange={set("address")} />
      </Field>
      <NotesField value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

// ==================== مجموعات الحسابات ====================

type AccountGroup = { id: number; the_number: number; group_name: string; notes: string | null };

function AccountGroupsSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["account_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id, the_number, group_name, notes")
        .order("the_number");
      if (error) throw error;
      return data as AccountGroup[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("account_groups").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذفت المجموعة");
      qc.invalidateQueries({ queryKey: ["account_groups"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  return (
    <>
      <Notice tone="info" className="mb-3">
        مجموعات الحسابات تُختار عند إضافة حساب أو تعديله في شجرة الحسابات.
      </Notice>
      <Toolbar action={<Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة مجموعة"}</Button>} />
      {open && <AccountGroupForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Network} title="لا توجد مجموعات حسابات بعد" hint="مثال: النقدية، البنوك، المصروفات." />
      ) : (
        <ul className="space-y-2">
          {data.map((g) => (
            <ListItem key={g.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{g.the_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.group_name}</span>
              </div>
              {g.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{g.notes}</p>}
              <div className="mt-2 flex justify-end">
                <RowActions
                  canEdit
                  canDelete
                  pending={del.isPending}
                  onEdit={() => setEditing(editing === g.id ? null : g.id)}
                  onDelete={() => del.mutate(g.id)}
                />
              </div>
              {editing === g.id && <AccountGroupForm initial={g} onDone={() => setEditing(null)} />}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function AccountGroupForm({ initial, onDone }: { initial?: AccountGroup; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ group_name: initial?.group_name ?? "", notes: initial?.notes ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      const fields = { group_name: f.group_name.trim(), notes: f.notes.trim() || null };
      if (initial) {
        const { data, error } = await supabase.from("account_groups").update(fields).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("account_groups").insert({ the_number: 0, ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيفت المجموعة");
      qc.invalidateQueries({ queryKey: ["account_groups"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الإضافة — الاسم مستخدم أو لا تملك الصلاحية"),
  });
  return (
    <FormCard className={initial ? "mt-3 mb-0" : undefined} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم المجموعة">
        <Input required placeholder="مثال: النقدية والصناديق" value={f.group_name} onChange={(e) => setF({ ...f, group_name: e.target.value })} />
      </Field>
      <NotesField value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

// ==================== التصنيفات ====================

const APPLIES: { value: string; label: string }[] = [
  { value: "customer", label: "عملاء" },
  { value: "agent", label: "وكلاء" },
  { value: "both", label: "عملاء ووكلاء" },
];

type Classification = { id: number; the_number: number; classification_name: string; applies_to: string; notes: string | null };

function ClassificationsSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["classifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classifications")
        .select("id, the_number, classification_name, applies_to, notes")
        .order("the_number");
      if (error) throw error;
      return data as Classification[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("classifications").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف التصنيف");
      qc.invalidateQueries({ queryKey: ["classifications"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  return (
    <>
      <Notice tone="info" className="mb-3">
        التصنيفات تُختار في ملف العميل والوكيل، وتُستخدم في التصفية والتقارير.
      </Notice>
      <Toolbar action={<Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة تصنيف"}</Button>} />
      {open && <ClassificationForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Tags} title="لا توجد تصنيفات بعد" hint="مثال: متكرر، جديد، شركات." />
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <ListItem key={c.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{c.the_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.classification_name}</span>
                <StatusPill>{APPLIES.find((a) => a.value === c.applies_to)?.label ?? c.applies_to}</StatusPill>
              </div>
              {c.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{c.notes}</p>}
              <div className="mt-2 flex justify-end">
                <RowActions
                  canEdit
                  canDelete
                  pending={del.isPending}
                  onEdit={() => setEditing(editing === c.id ? null : c.id)}
                  onDelete={() => del.mutate(c.id)}
                />
              </div>
              {editing === c.id && <ClassificationForm initial={c} onDone={() => setEditing(null)} />}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function ClassificationForm({ initial, onDone }: { initial?: Classification; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    classification_name: initial?.classification_name ?? "",
    applies_to: initial?.applies_to ?? "customer",
    notes: initial?.notes ?? "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const fields = {
        classification_name: f.classification_name.trim(),
        applies_to: f.applies_to,
        notes: f.notes.trim() || null,
      };
      if (initial) {
        const { data, error } = await supabase.from("classifications").update(fields).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("classifications").insert({ the_number: 0, ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيف التصنيف");
      qc.invalidateQueries({ queryKey: ["classifications"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الإضافة — التصنيف مستخدم أو لا تملك الصلاحية"),
  });
  return (
    <FormCard className={initial ? "mt-3 mb-0" : undefined} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم التصنيف">
        <Input required placeholder="مثال: متكرر" value={f.classification_name} onChange={(e) => setF({ ...f, classification_name: e.target.value })} />
      </Field>
      <Field label="يُنطبّق على">
        <select className={selectCls} value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })}>
          {APPLIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <NotesField value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

// ==================== مجموعات الموظفين ====================

type UserGroup = { id: number; the_number: number; group_name: string; allowed_screens: string[]; notes: string | null };
type Person = { id: string; username: string | null; full_name: string };
type Member = { group_id: number; user_id: string };

function UserGroupsSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["user_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_groups")
        .select("id, the_number, group_name, allowed_screens, notes")
        .order("the_number");
      if (error) throw error;
      return data as UserGroup[];
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["profiles_for_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name")
        .order("created_at");
      if (error) throw error;
      return data as Person[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["user_group_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_group_members").select("group_id, user_id");
      if (error) throw error;
      return data as Member[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("user_groups").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذفت المجموعة");
      qc.invalidateQueries({ queryKey: ["user_groups"] });
      qc.invalidateQueries({ queryKey: ["user_group_members"] });
      qc.invalidateQueries({ queryKey: ["screen-access"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  return (
    <>
      <Notice tone="info" className="mb-3">
        مجموعة الموظفين تُحدّد الشاشات التي تظهر لموظفيها في الرئيسية والتبويبات. المدير يرى كل شيء دائمًا.
      </Notice>
      <Toolbar action={<Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : "إضافة مجموعة"}</Button>} />
      {open && <UserGroupForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Users} title="لا توجد مجموعات موظفين بعد" hint="مثال: كاشيري الصناديق، خدمة الحوالات." />
      ) : (
        <ul className="space-y-2">
          {data.map((g) => (
            <ListItem key={g.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{g.the_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.group_name}</span>
                <StatusPill tone={g.allowed_screens.length ? "warn" : "ok"}>
                  {g.allowed_screens.length ? `${g.allowed_screens.length} شاشة` : "كل الشاشات"}
                </StatusPill>
              </div>
              {g.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{g.notes}</p>}
              <div className="mt-2 flex justify-end">
                <RowActions
                  canEdit
                  canDelete
                  pending={del.isPending}
                  onEdit={() => setEditing(editing === g.id ? null : g.id)}
                  onDelete={() => del.mutate(g.id)}
                />
              </div>
              {editing === g.id && <UserGroupForm initial={g} onDone={() => setEditing(null)} />}
              <GroupScreens group={g} />
              <div className="mt-3 border-t border-border pt-3">
                <Link to="/permissions" search={{ g: g.id }} className="inline-flex h-9 items-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/10">
                  تحديد صلاحيات المجموعة
                </Link>
              </div>
              <GroupMembers group={g} people={people} members={members} />
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function UserGroupForm({ initial, onDone }: { initial?: UserGroup; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ group_name: initial?.group_name ?? "", notes: initial?.notes ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      const fields = { group_name: f.group_name.trim(), notes: f.notes.trim() || null };
      if (initial) {
        const { data, error } = await supabase.from("user_groups").update(fields).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from("user_groups").insert({ the_number: 0, ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيفت المجموعة");
      qc.invalidateQueries({ queryKey: ["user_groups"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الإضافة — الاسم مستخدم أو لا تملك الصلاحية"),
  });
  return (
    <FormCard className={initial ? "mt-3 mb-0" : undefined} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم المجموعة">
        <Input required placeholder="مثال: كاشيري الصناديق" value={f.group_name} onChange={(e) => setF({ ...f, group_name: e.target.value })} />
      </Field>
      <NotesField value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}

/** تحديد الشاشات التي يراها موظفو المجموعة. */
function GroupScreens({ group }: { group: UserGroup }) {
  const qc = useQueryClient();
  const allowed = group.allowed_screens ?? [];

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const { data, error } = await supabase
        .from("user_groups")
        .update({ allowed_screens: next })
        .eq("id", group.id)
        .select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_groups"] });
      qc.invalidateQueries({ queryKey: ["screen-access"] });
    },
    onError: (e) => toast.error(editErrorMessage(e)),
  });

  const toggle = (screen: string) => {
    const next = allowed.includes(screen) ? allowed.filter((s) => s !== screen) : [...allowed, screen];
    confirmOperation("تعديل الشاشات المسموحة للمجموعة", () => save.mutate(next));
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">الشاشات المسموحة</p>
        {allowed.length > 0 && (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => confirmOperation("إزالة قيد الشاشات عن المجموعة", () => save.mutate([]))}
            className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-primary"
          >
            كل الشاشات
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SCREENS.map((s) => {
          const adminOnly = s.to === "/license";
          const on = !adminOnly && (allowed.length === 0 || allowed.includes(s.to));
          return (
            <Button
              key={s.to}
              variant="outline"
              size="sm"
              type="button"
              disabled={save.isPending || adminOnly}
              title={adminOnly ? "التفعيل للمدير فقط وإصدار الأكواد للمالك" : undefined}
              aria-pressed={on}
              onClick={() => toggle(s.to)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors " +
                (on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")
              }
            >
              {s.label}{adminOnly ? " — المدير فقط" : ""}
            </Button>
          );
        })}
      </div>
      {allowed.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          المجموعة بلا قيد على الشاشات العامة؛ التفعيل للمدير فقط.
        </p>
      )}
    </div>
  );
}

/** موظفو المجموعة: إضافة وإزالة. */
function GroupMembers({ group, people, members }: { group: UserGroup; people: Person[]; members: Member[] }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState("");
  const inGroup = members.filter((m) => m.group_id === group.id).map((m) => m.user_id);
  const named = inGroup
    .map((id) => ({ id, person: people.find((p) => p.id === id) }))
    .filter((x) => x.person);

  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_group_members").insert({ group_id: group.id, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُضيف الموظف للمجموعة");
      qc.invalidateQueries({ queryKey: ["user_group_members"] });
      qc.invalidateQueries({ queryKey: ["screen-access"] });
      setPick("");
    },
    onError: () => toast.error("تعذّر الإضافة — الموظف في المجموعة أو لا تملك الصلاحية"),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُزيل الموظف من المجموعة");
      qc.invalidateQueries({ queryKey: ["user_group_members"] });
      qc.invalidateQueries({ queryKey: ["screen-access"] });
    },
    onError: () => toast.error("تعذّرت الإزالة"),
  });

  const options = people.filter((p) => !inGroup.includes(p.id));

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
        الموظفون في المجموعة {named.length > 0 && <span className="ledger-figures">({named.length})</span>}
      </p>
      {named.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">لا موظفين في هذه المجموعة بعد.</p>
      ) : (
        <ul className="space-y-1.5">
          {named.map((x) => (
            <li key={x.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs">
                {x.person?.full_name || "بدون اسم"}
                {x.person?.username && <span dir="ltr" className="text-muted-foreground"> — {x.person.username}</span>}
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => confirmOperation("إزالة الموظف من المجموعة", () => remove.mutate(x.id))}
                className="rounded-lg border border-destructive/40 px-2 py-0.5 text-[11px] font-medium text-destructive"
              >
                إزالة
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select className={selectCls} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">اختر موظفًا…</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || "بدون اسم"}{p.username ? ` — ${p.username}` : ""}
              </option>
            ))}
          </select>
          <Button type="button" disabled={!pick || add.isPending} onClick={() => confirmOperation("إضافة الموظف للمجموعة", () => add.mutate(pick))}>إضافة</Button>
        </div>
      )}
    </div>
  );
}
