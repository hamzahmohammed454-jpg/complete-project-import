import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
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

export const Route = createFileRoute("/_authenticated/withdrawal-requests")({
  head: () => ({
    meta: [
      { title: "طلبات السحب — ابو طه للصرافة" },
      { name: "description", content: "طلبات سحب العملاء من أرصدتهم، تُرفع للمدير ويُرد عليها بقبول أو رفض." },
      { property: "og:title", content: "طلبات السحب — ابو طه للصرافة" },
      { property: "og:description", content: "طلبات سحب العملاء وردود الإدارة عليها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WithdrawalRequestsScreen,
});

type Req = {
  id: number;
  customer_id: number;
  currency_id: number;
  amount: number;
  reason: string | null;
  status: "معلق" | "مقبول" | "مرفوض";
  response: string | null;
  created_at: string;
  customers: { full_name: string } | null;
  currencies: { currency_name: string } | null;
};

function WithdrawalRequestsScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/withdrawal-requests");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["withdrawal_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("id, customer_id, currency_id, amount, reason, status, response, created_at, customers(full_name), currencies!currency_id(currency_name)")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as unknown as Req[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      const response = window.prompt("رد الإدارة (اختياري):");
      const args: { p_id: number; p_approve: boolean; p_response?: string } = { p_id: id, p_approve: approve };
      if (response) args.p_response = response;
      const { error } = await supabase.rpc("decide_withdrawal_request", args);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "قُبل الطلب — نفّذ الصرف بسند صرف عادي" : "رُفض الطلب");
      qc.invalidateQueries({ queryKey: ["withdrawal_requests"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const term = q.trim();
  const matches = term ? data.filter((r) => (r.customers?.full_name ?? "").includes(term)) : data;

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro
        title="طلبات السحب"
        subtitle="سجّل طلب سحب العميل من رصيده؛ القبول موافقة إدارية فقط، والصرف الفعلي يتم بسند صرف."
      />
      <DocumentToolbar
        selected={sel != null}
        canCreate={permissions.can("create")}
        canDelete={false}
        adding={open}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => undefined}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => searchRef.current?.focus()}
      />
      <Toolbar search={<Input ref={searchRef} placeholder="بحث باسم العميل" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <RequestForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={data.length === 0 ? "لا توجد طلبات سحب بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف طلبًا باختيار العميل والمبلغ والعملة." : "جرّب اسمًا آخر."}
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((r) => (
            <ListItem key={r.id} className={sel === r.id ? selectedRowCls : ""}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={sel === r.id}
                onClick={() => setSel(sel === r.id ? null : r.id)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">{r.customers?.full_name ?? "—"}</p>
                  <StatusPill tone={r.status === "مقبول" ? "ok" : r.status === "مرفوض" ? "bad" : "warn"}>{r.status}</StatusPill>
                </div>
                <p className="ledger-figures mt-1 text-xs text-muted-foreground">
                  {r.amount.toLocaleString("en-US")} {r.currencies?.currency_name ?? ""} — {r.created_at.slice(0, 10)}
                </p>
                {r.reason && <p className="mt-1 text-[11px] text-muted-foreground">{r.reason}</p>}
                {r.response && <p className="mt-1 text-[11px] font-medium text-primary">رد الإدارة: {r.response}</p>}
              </div>
              {isManager && r.status === "معلق" && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={async () => { if (await confirmAsk("قبول طلب السحب؟")) decide.mutate({ id: r.id, approve: true }); }}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                  >
                    قبول
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={async () => { if (await confirmAsk("رفض طلب السحب؟")) decide.mutate({ id: r.id, approve: false }); }}
                    className="text-[11px] font-medium text-destructive"
                  >
                    رفض
                  </button>
                </div>
              )}
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ customer_id: "", currency_id: "", amount: "", reason: "" });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!f.customer_id) throw new Error("اختر العميل");
      if (!f.currency_id) throw new Error("اختر العملة");
      if (!(Number(f.amount) > 0)) throw new Error("أدخل مبلغًا صحيحًا");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("withdrawal_requests").insert({
        customer_id: Number(f.customer_id),
        currency_id: Number(f.currency_id),
        amount: Number(f.amount),
        reason: f.reason.trim() || null,
        requested_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُرسل الطلب وينتظر رد الإدارة");
      qc.invalidateQueries({ queryKey: ["withdrawal_requests"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="العميل">
        <select required value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">اختر العميل…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="ledger-figures" />
        </Field>
        <Field label="العملة">
          <select required value={f.currency_id} onChange={(e) => setF({ ...f, currency_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">اختر…</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="السبب (اختياري)">
        <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      <button type="submit" disabled={m.isPending} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {m.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}
      </button>
    </FormCard>
  );
}
