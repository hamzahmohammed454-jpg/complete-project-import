import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Landmark } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/banks")({
  head: () => ({
    meta: [
      { title: "دليل البنوك — ابو طه للصرافة" },
      { name: "description", content: "أسماء البنوك التي تُسحب عليها الشيكات، تُستخدم في دفاتر الشيكات وتسجيل الشيكات." },
      { property: "og:title", content: "دليل البنوك — ابو طه للصرافة" },
      { property: "og:description", content: "تهيئة أسماء البنوك للشيكات والحسابات البنكية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BanksScreen,
});

type Bank = { id: number; bank_name: string; notes: string | null };

function BanksScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/banks");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, bank_name, notes").order("bank_name");
      if (error) throw error;
      return data as Bank[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("banks").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف البنك");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["banks"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term ? data.filter((b) => b.bank_name.includes(term)) : data;

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="دليل البنوك" subtitle="أسماء البنوك التي تُسحب عليها الشيكات؛ تظهر عند تسجيل دفاتر الشيكات والشيكات الواردة والصادرة." />
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
      <Toolbar search={<Input ref={searchRef} placeholder="بحث باسم البنك" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <BankForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={data.length === 0 ? "لا توجد بنوك بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف أول بنك تتعامل معه الشيكات." : "جرّب اسمًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((b) => (
            <ListItem key={b.id} className={sel === b.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === b.id}
                onClick={() => setSel(sel === b.id ? null : b.id)}
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <p className="min-w-0 truncate text-sm font-semibold">{b.bank_name}</p>
                {isManager && permissions.can("delete") && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async (e) => { e.stopPropagation(); if (await confirmAsk(`حذف البنك «${b.bank_name}»؟`)) del.mutate(b.id); }}
                    className="shrink-0 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
              {b.notes && <p className="mt-1 text-[11px] text-muted-foreground">{b.notes}</p>}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function BankForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("banks").insert({ bank_name: name.trim(), notes: notes.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُضيف البنك");
      qc.invalidateQueries({ queryKey: ["banks"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اسم البنك">
        <Input required placeholder="مثال: بنك التضامن" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" disabled={m.isPending || !name.trim()}>حفظ البنك</Button>
    </FormCard>
  );
}
