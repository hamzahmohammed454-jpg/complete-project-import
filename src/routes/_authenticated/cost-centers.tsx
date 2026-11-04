import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Field,
  FormCard,
  ListItem,
  LoadingRows,
  Toolbar,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/cost-centers")({
  head: () => ({
    meta: [
      { title: "مراكز التكلفة — ابو طه للصرافة" },
      { name: "description", content: "دليل مراكز التكلفة لتوزيع المصروفات والإيرادات على الأقسام." },
      { property: "og:title", content: "مراكز التكلفة — ابو طه للصرافة" },
      { property: "og:description", content: "تهيئة مراكز التكلفة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CostCentersScreen,
});

type Center = { id: number; the_number: number | null; center_name: string; notes: string | null };

function CostCentersScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/cost-centers");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["cost_centers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_centers").select("id, the_number, center_name, notes").order("the_number");
      if (error) throw error;
      return data as Center[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("cost_centers").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف المركز");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["cost_centers"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term ? data.filter((c) => c.center_name.includes(term) || String(c.the_number ?? "").includes(term)) : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="مراكز التكلفة" subtitle="أقسام المنشأة التي تُوزَّع عليها المصروفات والإيرادات (مثل: الفرع الرئيسي، قسم الحوالات)." />
      <DocumentToolbar
        selected={sel != null}
        canCreate={permissions.can("create")}
        canDelete={permissions.can("delete")}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (sel != null) del.mutate(sel); }}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث باسم المركز أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <CenterForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Target}
          title={data.length === 0 ? "لا توجد مراكز تكلفة بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول مركز تكلفة." : "جرّب بحثًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((c) => (
            <ListItem key={c.id} className={sel === c.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === c.id}
                onClick={() => setSel(sel === c.id ? null : c.id)}
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <p className="min-w-0 truncate text-sm font-semibold">
                  <span className="ledger-figures text-primary">{c.the_number ?? c.id}</span> · {c.center_name}
                </p>
                {isManager && permissions.can("delete") && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async (e) => { e.stopPropagation(); if (await confirmAsk(`حذف مركز «${c.center_name}»؟`)) del.mutate(c.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
              {c.notes && <p className="mt-1 text-[11px] text-muted-foreground">{c.notes}</p>}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function CenterForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cost_centers").insert({ center_name: name.trim(), notes: notes.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُضيف مركز التكلفة");
      qc.invalidateQueries({ queryKey: ["cost_centers"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم المركز">
        <Input required placeholder="مثال: الفرع الرئيسي" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" disabled={m.isPending || !name.trim()}>حفظ المركز</Button>
    </FormCard>
  );
}
