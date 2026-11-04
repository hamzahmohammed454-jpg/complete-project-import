import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { BookCopy } from "lucide-react";
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
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { deleteErrorMessage, ensureAffected } from "@/lib/crud-errors";

export const Route = createFileRoute("/_authenticated/check-books")({
  head: () => ({
    meta: [
      { title: "دفاتر الشيكات — ابو طه للصرافة" },
      { name: "description", content: "تسجيل دفاتر الشيكات بنطاق أرقامها وربطها بالبنك والحساب البنكي، ومتابعة المستخدم منها." },
      { property: "og:title", content: "دفاتر الشيكات — ابو طه للصرافة" },
      { property: "og:description", content: "تهيئة دفاتر الشيكات ونطاقات أرقامها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckBooksScreen,
});

type Book = {
  id: number;
  bank_id: number | null;
  account_number: string | null;
  from_number: number;
  to_number: number;
  notes: string | null;
  banks: { bank_name: string } | null;
};

function CheckBooksScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/check-books");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["check_books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_books")
        .select("id, bank_id, account_number, from_number, to_number, notes, banks(bank_name)")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as unknown as Book[];
    },
  });

  const { data: usedCounts = {} } = useQuery({
    queryKey: ["check_books_used"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checks").select("book_id").not("book_id", "is", null);
      if (error) throw error;
      const counts: Record<number, number> = {};
      for (const row of data) counts[row.book_id as number] = (counts[row.book_id as number] ?? 0) + 1;
      return counts;
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from("check_books").delete().eq("id", id).select("id");
      if (error) throw error;
      ensureAffected(data);
    },
    onSuccess: () => {
      toast.success("حُذف الدفتر");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["check_books"] });
    },
    onError: (e) => toast.error(deleteErrorMessage(e)),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((b) =>
        (b.banks?.bank_name ?? "").includes(term) ||
        (b.account_number ?? "").includes(term) ||
        String(b.from_number).includes(term) ||
        String(b.to_number).includes(term),
      )
    : data;

  return (
    <>
      <MenuStrip tab="/boxes" />
      <SectionIntro title="دفاتر الشيكات" subtitle="سجّل كل دفتر شيكات بنطاق أرقامه؛ عند تسجيل شيك صادر من دفتر يُتحقق أن الرقم داخل النطاق وغير مكرر." />
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
      <Toolbar search={<Input ref={searchRef} placeholder="بحث باسم البنك أو رقم الحساب" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <BookForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={BookCopy}
          title={data.length === 0 ? "لا توجد دفاتر شيكات بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "سجّل أول دفتر ببنكه ونطاق أرقامه." : "جرّب بحثًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((b) => {
            const used = usedCounts[b.id] ?? 0;
            const total = b.to_number - b.from_number + 1;
            return (
              <ListItem key={b.id} className={sel === b.id ? selectedRowCls : ""}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={sel === b.id}
                  onClick={() => setSel(sel === b.id ? null : b.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold">
                      {b.banks?.bank_name ?? "بدون بنك"}
                      {b.account_number ? <span className="ledger-figures text-muted-foreground"> — حساب {b.account_number}</span> : null}
                    </p>
                    <span className="ledger-figures shrink-0 text-xs text-muted-foreground">مستخدم {used} من {total}</span>
                  </div>
                  <p className="ledger-figures mt-1 text-xs text-muted-foreground">الأرقام من {b.from_number} إلى {b.to_number}</p>
                  {b.notes && <p className="mt-1 text-[11px] text-muted-foreground">{b.notes}</p>}
                </div>
                {isManager && permissions.can("delete") && used === 0 && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async () => { if (await confirmAsk("حذف هذا الدفتر؟")) del.mutate(b.id); }}
                    className="mt-2 text-[11px] font-medium text-destructive"
                  >
                    حذف
                  </button>
                )}
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function BookForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ bank_id: "", account_number: "", from_number: "", to_number: "", notes: "" });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("id, bank_name").order("bank_name");
      if (error) throw error;
      return data;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("check_books").insert({
        bank_id: f.bank_id ? Number(f.bank_id) : null,
        account_number: f.account_number.trim() || null,
        from_number: Number(f.from_number),
        to_number: Number(f.to_number),
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سُجّل الدفتر");
      qc.invalidateQueries({ queryKey: ["check_books"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="البنك">
        <select className={selectCls} value={f.bank_id} onChange={set("bank_id")}>
          <option value="">اختر البنك (اختياري)</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
        </select>
      </Field>
      <Field label="رقم الحساب البنكي">
        <Input placeholder="اختياري" value={f.account_number} onChange={set("account_number")} className="ledger-figures" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="من رقم">
          <Input required inputMode="numeric" placeholder="1" value={f.from_number} onChange={set("from_number")} className="ledger-figures" />
        </Field>
        <Field label="إلى رقم">
          <Input required inputMode="numeric" placeholder="50" value={f.to_number} onChange={set("to_number")} className="ledger-figures" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Input placeholder="اختياري" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending || !f.from_number || !f.to_number}>حفظ الدفتر</Button>
    </FormCard>
  );
}
