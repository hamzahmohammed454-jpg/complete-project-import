import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Ban, Building2, Flag, IdCard, ListChecks, MapPin, MapPinned, ShieldAlert } from "lucide-react";
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
  Toolbar,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, editErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/transfer-setup")({
  head: () => ({
    meta: [
      { title: "تهيئة الحوالات — ابو طه للصرافة" },
      { name: "description", content: "أدلة الدول والمحافظات والمناطق وأغراض التحويل والقائمة السوداء التي تُختار في نموذج الحوالة." },
      { property: "og:title", content: "تهيئة الحوالات — ابو طه للصرافة" },
      { property: "og:description", content: "أدلة الدول والمحافظات والمناطق وأغراض التحويل والقائمة السوداء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { kind?: Kind } =>
    typeof s["kind"] === "string" && ["countries", "governorates", "areas", "purposes", "blacklist", "entities", "forbidden", "receivers"].includes(s["kind"]) ? { kind: s["kind"] as Kind } : {},
  component: TransferSetupScreen,
});

type Kind = "countries" | "governorates" | "areas" | "purposes" | "blacklist" | "entities" | "forbidden" | "receivers";
type Row = { id: number; the_number: number; [key: string]: unknown };
type TableName = "countries" | "governorates" | "areas" | "transfer_purposes" | "blacklist" | "transfer_entities" | "forbidden_texts" | "receiver_cards";

type FieldSpec =
  | { key: string; label: string; type: "text"; required?: boolean; placeholder?: string; tel?: boolean }
  | { key: string; label: string; type: "select"; source: "countries" | "governorates"; required?: boolean }
  | { key: string; label: string; type: "date" }
  | { key: string; label: string; type: "flag" };

type Directory = {
  table: TableName;
  title: string;
  subtitle: string;
  nameKey: string;
  icon: typeof Flag;
  fields: FieldSpec[];
};

const DIRECTORIES: Record<Kind, Directory> = {
  countries: {
    table: "countries",
    title: "دليل الدول",
    subtitle: "الدول التي تُرسَل إليها الحوالات أو تصل منها.",
    nameKey: "country_name",
    icon: Flag,
    fields: [
      { key: "country_name", label: "اسم الدولة", type: "text", required: true, placeholder: "مثال: اليمن" },
      { key: "phone_code", label: "رمز الهاتف", type: "text", placeholder: "مثال: ‎+967" },
      { key: "active", label: "نشطة", type: "flag" },
    ],
  },
  governorates: {
    table: "governorates",
    title: "دليل المحافظات",
    subtitle: "محافظات كل دولة، وتُختار في نموذج الحوالة.",
    nameKey: "governorate_name",
    icon: MapPin,
    fields: [
      { key: "country_id", label: "الدولة", type: "select", source: "countries", required: true },
      { key: "governorate_name", label: "اسم المحافظة", type: "text", required: true },
      { key: "active", label: "نشطة", type: "flag" },
    ],
  },
  areas: {
    table: "areas",
    title: "دليل المناطق",
    subtitle: "مناطق كل محافظة.",
    nameKey: "area_name",
    icon: MapPinned,
    fields: [
      { key: "governorate_id", label: "المحافظة", type: "select", source: "governorates", required: true },
      { key: "area_name", label: "اسم المنطقة", type: "text", required: true },
      { key: "active", label: "نشطة", type: "flag" },
    ],
  },
  purposes: {
    table: "transfer_purposes",
    title: "دليل أغراض التحويل",
    subtitle: "الأغراض التي تُختار في حقل غرض التحويل.",
    nameKey: "purpose_name",
    icon: ListChecks,
    fields: [
      { key: "purpose_name", label: "الغرض", type: "text", required: true, placeholder: "مثال: نفقات دراسية" },
      { key: "active", label: "نشط", type: "flag" },
    ],
  },
  blacklist: {
    table: "blacklist",
    title: "القائمة السوداء",
    subtitle: "أسماء أو هواتف أو هويات يُنبَّه عنها عند إدخال الحوالة.",
    nameKey: "full_name",
    icon: ShieldAlert,
    fields: [
      { key: "full_name", label: "الاسم", type: "text", required: true },
      { key: "identity_number", label: "رقم الهوية", type: "text" },
      { key: "phone_number", label: "رقم الهاتف", type: "text", tel: true },
      { key: "reason", label: "سبب الإدراج", type: "text" },
      { key: "the_date", label: "تاريخ الإدراج", type: "date" },
    ],
  },
  entities: {
    table: "transfer_entities",
    title: "دليل الجهات",
    subtitle: "الجهات التي تُرسَل إليها الحوالات أو تصل منها.",
    nameKey: "entity_name",
    icon: Building2,
    fields: [
      { key: "entity_name", label: "اسم الجهة", type: "text", required: true },
      { key: "country_id", label: "الدولة", type: "select", source: "countries" },
      { key: "phone_number", label: "الهاتف", type: "text", tel: true },
      { key: "notes", label: "ملاحظات", type: "text" },
      { key: "active", label: "نشطة", type: "flag" },
    ],
  },
  forbidden: {
    table: "forbidden_texts",
    title: "النصوص الممنوعة",
    subtitle: "كلمات يُنبَّه عنها إذا وردت في بيانات الحوالة أو ملاحظاتها — تنبيه فقط دون منع الحفظ.",
    nameKey: "forbidden_text",
    icon: Ban,
    fields: [
      { key: "forbidden_text", label: "النص", type: "text", required: true },
      { key: "active", label: "نشط", type: "flag" },
    ],
  },
  receivers: {
    table: "receiver_cards",
    title: "بطاقات المستلمين",
    subtitle: "بيانات المستلمين المتكررين لاختيارهم بسرعة في الحوالة.",
    nameKey: "full_name",
    icon: IdCard,
    fields: [
      { key: "full_name", label: "اسم المستلم", type: "text", required: true },
      { key: "phone_number", label: "الهاتف", type: "text", tel: true },
      { key: "identity_type", label: "نوع الهوية", type: "text", placeholder: "بطاقة شخصية / جواز" },
      { key: "identity_number", label: "رقم الهوية", type: "text" },
      { key: "country_id", label: "الدولة", type: "select", source: "countries" },
      { key: "notes", label: "ملاحظات", type: "text" },
    ],
  },
};

const KINDS: { value: Kind; label: string }[] = [
  { value: "countries", label: "الدول" },
  { value: "governorates", label: "المحافظات" },
  { value: "areas", label: "المناطق" },
  { value: "purposes", label: "أغراض التحويل" },
  { value: "blacklist", label: "القائمة السوداء" },
  { value: "entities", label: "الجهات" },
  { value: "forbidden", label: "النصوص الممنوعة" },
  { value: "receivers", label: "بطاقات المستلمين" },
];

function TransferSetupScreen() {
  const { kind: searchKind } = Route.useSearch();
  const [kind, setKind] = useState<Kind>(searchKind ?? "countries");
  useEffect(() => { if (searchKind) setKind(searchKind); }, [searchKind]);
  const directory = DIRECTORIES[kind];
  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro title="تهيئة الحوالات" subtitle="أدلة تُختار في نموذج الحوالة: الدول والمحافظات والمناطق وأغراض التحويل والقائمة السوداء." />
      <Segments ariaLabel="أدلة الحوالات" options={KINDS} value={kind} onChange={setKind} />
      <div className="mt-4">
        <DirectoryPanel key={kind} kind={kind} directory={directory} />
      </div>
    </>
  );
}

function DirectoryPanel({ kind, directory }: { kind: Kind; directory: Directory }) {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["transfer-setup", directory.table],
    queryFn: async () => {
      const { data, error } = await supabase.from(directory.table).select("*").order("the_number");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const { data: parents } = useParentOptions();

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from(directory.table).delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف السجل");
      qc.invalidateQueries({ queryKey: ["transfer-setup"] });
      qc.invalidateQueries({ queryKey: ["transfer-setup-options"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((row) => searchText(row, directory, parents).includes(term))
    : data;

  return (
    <>
      <Notice tone="info">{directory.subtitle}</Notice>
      <Toolbar
        search={<Input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />}
        action={isManager ? <Button onClick={() => setOpen((v) => !v)}>{open ? "إغلاق" : `إضافة ${directory.title.replace("دليل ", "")}`}</Button> : undefined}
      />
      {open && <DirectoryForm kind={kind} onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={directory.icon}
          title={data.length === 0 ? `لا توجد ${directory.title.replace("دليل ", "")} بعد` : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول سجل ليظهر في نموذج الحوالة." : "جرّب كلمة أخرى."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((row) => (
            <ListItem key={row.id}>
              <div className="flex items-center gap-3">
                <span className="ledger-figures shrink-0 text-sm text-primary">{row.the_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{String(row[directory.nameKey] ?? "")}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{secondaryText(row, kind, parents)}</span>
              </div>
              {isManager && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <RowActions
                    canEdit
                    canDelete
                    pending={del.isPending}
                    onEdit={() => setEditing(editing === row.id ? null : row.id)}
                    onDelete={() => del.mutate(row.id)}
                  />
                </div>
              )}
              {editing === row.id && <DirectoryForm kind={kind} initial={row} onDone={() => setEditing(null)} />}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

/** الدول والمحافظات التي تحتاجها حقول الاختيار وعرض السطور. */
function useParentOptions() {
  return useQuery({
    queryKey: ["transfer-setup-options"],
    queryFn: async () => {
      const [countries, governorates] = await Promise.all([
        supabase.from("countries").select("id, the_number, country_name").order("the_number"),
        supabase.from("governorates").select("id, the_number, governorate_name, country_id").order("the_number"),
      ]);
      if (countries.error) throw countries.error;
      if (governorates.error) throw governorates.error;
      return {
        countries: (countries.data ?? []) as { id: number; the_number: number; country_name: string }[],
        governorates: (governorates.data ?? []) as { id: number; the_number: number; governorate_name: string; country_id: number }[],
      };
    },
  });
}

function searchText(row: Row, directory: Directory, parents: { countries: { id: number; country_name: string }[] } | undefined) {
  const parts = directory.fields
    .filter((field) => field.type !== "flag")
    .map((field) => String(row[field.key] ?? ""));
  if (directory.table === "governorates") {
    parts.push(parents?.countries.find((c) => c.id === Number(row["country_id"]))?.country_name ?? "");
  }
  return parts.join(" ").toLowerCase();
}

function secondaryText(row: Row, kind: Kind, parents: { countries: { id: number; country_name: string }[]; governorates: { id: number; governorate_name: string }[] } | undefined) {
  if (kind === "countries") return String(row["phone_code"] ?? "");
  if (kind === "governorates") return parents?.countries.find((c) => c.id === Number(row["country_id"]))?.country_name ?? "";
  if (kind === "areas") return parents?.governorates.find((g) => g.id === Number(row["governorate_id"]))?.governorate_name ?? "";
  if (kind === "entities" || kind === "receivers") return [parents?.countries.find((c) => c.id === Number(row["country_id"]))?.country_name, row["phone_number"], row["identity_number"]].filter(Boolean).join(" · ");
  if (kind === "blacklist") return [row["identity_number"], row["phone_number"], row["reason"]].filter(Boolean).join(" · ");
  return "";
}

function DirectoryForm({ kind, initial, onDone }: { kind: Kind; initial?: Row; onDone: () => void }) {
  const qc = useQueryClient();
  const directory = DIRECTORIES[kind];
  const { data: parents } = useParentOptions();
  const [f, setF] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const field of directory.fields) {
      const raw = initial?.[field.key];
      start[field.key] = field.type === "flag" ? (raw === false ? "false" : "true") : raw == null ? "" : String(raw);
    }
    return start;
  });

  const m = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const field of directory.fields) {
        const value = (f[field.key] ?? "").trim();
        if (field.type === "select") payload[field.key] = value ? Number(value) : null;
        else if (field.type === "flag") payload[field.key] = value === "true";
        else if (field.type === "date" && !value) continue;
        else payload[field.key] = value || null;
      }
      if (initial) {
        const { data, error } = await supabase.from(directory.table).update(payload as never).eq("id", initial.id).select("id");
        if (error) throw error;
        ensureAffected(data);
        return;
      }
      const { error } = await supabase.from(directory.table).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(initial ? "حُفظ التعديل" : "أُضيف السجل");
      qc.invalidateQueries({ queryKey: ["transfer-setup"] });
      qc.invalidateQueries({ queryKey: ["transfer-setup-options"] });
      onDone();
    },
    onError: (e) => toast.error(initial ? editErrorMessage(e) : "تعذّر الحفظ — الاسم مضاف مسبقًا أو ناقص"),
  });

  return (
    <FormCard className={initial ? "mt-3 mb-0" : undefined} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      {directory.fields.map((field) => (
        <Field key={field.key} label={field.label}>
          {field.type === "select" ? (
            <select
              required={field.required}
              className={selectCls}
              value={f[field.key] ?? ""}
              onChange={(e) => setF({ ...f, [field.key]: e.target.value })}
            >
              <option value="">اختر</option>
              {(field.source === "countries" ? parents?.countries ?? [] : parents?.governorates ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {field.source === "countries" ? (option as { country_name: string }).country_name : (option as { governorate_name: string }).governorate_name}
                </option>
              ))}
            </select>
          ) : field.type === "date" ? (
            <Input type="date" value={f[field.key] ?? ""} onChange={(e) => setF({ ...f, [field.key]: e.target.value })} />
          ) : field.type === "flag" ? (
            <select className={selectCls} value={f[field.key] ?? "true"} onChange={(e) => setF({ ...f, [field.key]: e.target.value })}>
              <option value="true">نعم</option>
              <option value="false">لا</option>
            </select>
          ) : (
            <Input
              required={field.required}
              inputMode={field.tel ? "tel" : undefined}
              placeholder={field.placeholder}
              value={f[field.key] ?? ""}
              onChange={(e) => setF({ ...f, [field.key]: e.target.value })}
              className={field.tel ? "ledger-figures" : undefined}
            />
          )}
        </Field>
      ))}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={m.isPending}>{initial ? "حفظ التعديل" : "حفظ"}</Button>
        {initial && <Button type="button" variant="outline" onClick={onDone}>إلغاء</Button>}
      </div>
    </FormCard>
  );
}
