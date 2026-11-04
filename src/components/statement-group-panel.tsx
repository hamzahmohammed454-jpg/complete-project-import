import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, Folder, FolderOpen, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormCard, Notice } from "@/components/ui-kit";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { supabase } from "@/integrations/supabase/client";
import { accountsInStatementGroup, type GroupAccount } from "@/lib/statement-groups";

export function StatementGroupPanel({ accounts, groups, selected, onSelect }: {
  accounts: GroupAccount[];
  groups: { id: number; group_name: string }[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [term, setTerm] = useState("");
  const qc = useQueryClient();
  const setup = useScreenPermissions("/setup");
  const accountPermissions = useScreenPermissions("/accounts");
  const invalidate = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["statement-directory"] }), qc.invalidateQueries({ queryKey: ["account_groups"] }), qc.invalidateQueries({ queryKey: ["accounts"] })]);
  };
  const create = useMutation({
    mutationFn: async () => {
      const r = await supabase.from("account_groups").insert({ group_name: name.trim(), the_number: 0 }).select("id").single();
      if (r.error) throw r.error;
      return r.data.id;
    },
    onSuccess: async (id) => { await invalidate(); onSelect(id); setName(""); setAdding(false); toast.success("أُضيفت المجموعة"); },
    onError: () => toast.error("تعذّر إضافة المجموعة؛ راجع الاسم والصلاحية"),
  });
  const assign = useMutation({
    mutationFn: async () => {
      if (selected === null) throw new Error("اختر مجموعة");
      // Update only changed presentation assignments; no financial records are touched.
      for (const account of accounts) {
        const included = checked.includes(account.id);
        const next = included ? selected : account.group_id === selected ? null : account.group_id;
        if (next === account.group_id) continue;
        const r = await supabase.from("accounts").update({ group_id: next }).eq("id", account.id).select("id");
        if (r.error) throw r.error;
        if (!r.data.length) throw new Error("لا تملك صلاحية تعديل الحساب");
      }
    },
    onSuccess: async () => { await invalidate(); setManaging(false); toast.success("حُفظت حسابات المجموعة"); },
    onError: async () => { await invalidate(); toast.error("لم يكتمل حفظ الحسابات؛ أعد فتح القائمة لمراجعة المحفوظ"); },
  });
  const choose = (id: number | null) => { onSelect(id); setManaging(false); };
  return <aside aria-label="مجموعات كشف الحساب" className="min-w-0 border-b border-border pb-3 sm:border-b-0 sm:border-e sm:pe-3 print:hidden">
    <div className="mb-2 flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label={expanded ? "طي المجموعات" : "فتح المجموعات"} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}</Button>
      <Button variant={selected === null ? "secondary" : "ghost"} className="h-auto min-h-9 min-w-0 flex-1 justify-start gap-1 px-1 whitespace-normal text-start text-xs" onClick={() => choose(null)}><FolderOpen className="size-4 shrink-0" /><span>كشف الحساب</span></Button>
      {setup.can("create") && <Button variant="ghost" size="icon" title="إضافة مجموعة" aria-label="إضافة مجموعة" onClick={() => { setAdding(!adding); setManaging(false); }}><Plus className="size-4" /></Button>}
    </div>
    {adding && <FormCard onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="اسم المجموعة"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Button type="submit" disabled={create.isPending || !name.trim()}>حفظ المجموعة</Button>
    </FormCard>}
    {expanded && <div className="max-h-64 space-y-1 overflow-y-auto sm:max-h-96">
      {groups.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">لا توجد مجموعات بعد.</p>}
      {groups.map((g) => <Button key={g.id} variant={selected === g.id ? "secondary" : "ghost"} className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal text-start" aria-pressed={selected === g.id} onClick={() => choose(g.id)}>
        {selected === g.id ? <FolderOpen className="size-4 shrink-0 text-primary" /> : <Folder className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 break-words">{g.group_name}</span><span className="ledger-figures text-xs text-muted-foreground">{accountsInStatementGroup(accounts, g.id).length}</span>
      </Button>)}
    </div>}
    {selected !== null && accountPermissions.can("update") && <Button variant="outline" className="mt-3 w-full gap-2" onClick={() => { setManaging(!managing); setAdding(false); setTerm(""); setChecked(accountsInStatementGroup(accounts, selected).map((a) => a.id)); }}><Settings2 className="size-4" />حسابات المجموعة</Button>}
    {managing && <FormCard className="mt-3" onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
      <div className="flex items-center justify-between"><span className="text-sm font-medium">اختيار الحسابات</span><Button variant="ghost" size="icon" title="إغلاق" aria-label="إغلاق اختيار الحسابات" onClick={() => setManaging(false)}><X className="size-4" /></Button></div>
      <Input aria-label="بحث الحسابات" placeholder="الاسم أو رقم الحساب" value={term} onChange={(e) => setTerm(e.target.value)} />
      <div className="max-h-64 space-y-2 overflow-y-auto">{accounts.filter((a) => `${a.account_name} ${a.account_number}`.includes(term.trim())).map((a) => <label key={a.id} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={checked.includes(a.id)} onChange={(e) => setChecked((ids) => e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id))} /><span>{a.account_name}<span className="ledger-figures ms-1 text-muted-foreground">{a.account_number}</span>{a.group_id !== null && a.group_id !== selected && <span className="block text-muted-foreground">نقل من: {groups.find((g) => g.id === a.group_id)?.group_name}</span>}</span></label>)}</div>
      <Button type="submit" disabled={assign.isPending}>حفظ الحسابات</Button>
    </FormCard>}
    {selected !== null && !accountsInStatementGroup(accounts, selected).length && !managing && <Notice className="mt-3">هذه المجموعة لا تحتوي حسابات.</Notice>}
  </aside>;
}