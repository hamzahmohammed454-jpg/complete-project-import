import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
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
  StatusPill,
  Toolbar,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/financial-years")({
  head: () => ({
    meta: [
      { title: "السنوات المالية — ابو طه للصرافة" },
      { name: "description", content: "سجل السنوات المالية ببدايتها ونهايتها وقفلها بعد الإقفال." },
      { property: "og:title", content: "السنوات المالية — ابو طه للصرافة" },
      { property: "og:description", content: "تهيئة السنوات المالية وقفلها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancialYearsScreen,
});

type Year = {
  id: number;
  the_year: number;
  start_date: string;
  end_date: string;
  locked: boolean;
  notes: string | null;
};

function FinancialYearsScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/financial-years");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["financial_years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_years").select("id, the_year, start_date, end_date, locked, notes").order("the_year", { ascending: false });
      if (error) throw error;
      return data as Year[];
    },
  });

  const toggleLock = useMutation({
    mutationFn: async (y: Year) => {
      const { data, error } = await supabase.from("financial_years").update({ locked: !y.locked }).eq("id", y.id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: (_d, y) => {
      toast.success(y.locked ? "فُتحت السنة" : "قُفلت السنة");
      qc.invalidateQueries({ queryKey: ["financial_years"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("financial_years").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذفت السنة");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["financial_years"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term ? data.filter((y) => String(y.the_year).includes(term)) : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro title="السنوات المالية" subtitle="سجّل كل سنة مالية ببدايتها ونهايتها؛ القفل يعلّم السنة المنتهية حتى لا تُعدَّل قيودها." />
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
      <Toolbar search={<Input ref={searchRef} placeholder="بحث برقم السنة" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <YearForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={data.length === 0 ? "لا توجد سنوات مالية بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف السنة الحالية ببدايتها ونهايتها." : "جرّب سنة أخرى."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((y) => (
            <ListItem key={y.id} className={sel === y.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === y.id}
                onClick={() => setSel(sel === y.id ? null : y.id)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="ledger-figures min-w-0 truncate text-sm font-semibold">سنة {y.the_year}</p>
                  <StatusPill tone={y.locked ? "bad" : "ok"}>{y.locked ? "مقفلة" : "مفتوحة"}</StatusPill>
                </div>
                <p className="ledger-figures mt-1 text-xs text-muted-foreground">من {y.start_date} إلى {y.end_date}</p>
                {y.notes && <p className="mt-1 text-[11px] text-muted-foreground">{y.notes}</p>}
              </div>
              {isManager && (
                <div className="mt-2 flex gap-2">
                  {permissions.can("update") && (
                    <button
                      type="button"
                      disabled={toggleLock.isPending}
                      onClick={async () => { if (await confirmAsk(y.locked ? `فتح سنة ${y.the_year}؟` : `قفل سنة ${y.the_year}؟`)) toggleLock.mutate(y); }}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                    >
                      {y.locked ? "فتح السنة" : "قفل السنة"}
                    </button>
                  )}
                  {permissions.can("delete") && (
                    <button
                      type="button"
                      disabled={del.isPending}
                      onClick={async () => { if (await confirmAsk(`حذف سنة ${y.the_year}؟`)) del.mutate(y.id); }}
                      className="text-[11px] font-medium text-destructive"
                    >
                      حذف
                    </button>
                  )}
                </div>
              )}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function YearForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ the_year: String(new Date().getFullYear()), start_date: "", end_date: "", notes: "" });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("financial_years").insert({
        the_year: Number(f.the_year),
        start_date: f.start_date,
        end_date: f.end_date,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُضيفت السنة المالية");
      qc.invalidateQueries({ queryKey: ["financial_years"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="السنة">
        <Input required inputMode="numeric" value={f.the_year} onChange={set("the_year")} className="ledger-figures" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="من تاريخ">
          <Input required type="date" value={f.start_date} onChange={set("start_date")} className="ledger-figures" />
        </Field>
        <Field label="إلى تاريخ">
          <Input required type="date" value={f.end_date} onChange={set("end_date")} className="ledger-figures" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || !f.start_date || !f.end_date}>حفظ السنة</Button>
    </FormCard>
  );
}
