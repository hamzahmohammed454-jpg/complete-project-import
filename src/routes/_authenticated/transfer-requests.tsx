import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileQuestion } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/transfer-requests")({
  head: () => ({
    meta: [
      { title: "طلبات الحوالات — ابو طه للصرافة" },
      { name: "description", content: "طلبات تعديل وإلغاء وإيقاف الحوالات، تُرفع للمدير ولا تُنفَّذ إلا بموافقته." },
      { property: "og:title", content: "طلبات الحوالات — ابو طه للصرافة" },
      { property: "og:description", content: "طلبات تعديل وإلغاء وإيقاف الحوالات بموافقة المدير." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransferRequestsScreen,
});

type Req = {
  id: number;
  transfer_kind: "outgoing" | "incoming";
  transfer_id: number;
  request_type: "modify" | "cancel" | "stop";
  reason: string;
  payload: Record<string, string> | null;
  status: "معلق" | "مقبول" | "مرفوض";
  created_at: string;
};

const TYPE_LABEL: Record<Req["request_type"], string> = { modify: "تعديل", cancel: "إلغاء", stop: "إيقاف" };
const KIND_LABEL: Record<Req["transfer_kind"], string> = { outgoing: "صادرة", incoming: "واردة" };

function TransferRequestsScreen() {
  const qc = useQueryClient();
  const { isManager } = useAppRoles();
  const permissions = useScreenPermissions("/transfer-requests");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["transfer_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_requests")
        .select("id, transfer_kind, transfer_id, request_type, reason, payload, status, created_at")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as Req[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_transfer_request", { p_id: id, p_approve: approve });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "قُبل الطلب ونُفّذ" : "رُفض الطلب");
      qc.invalidateQueries({ queryKey: ["transfer_requests"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const term = q.trim();
  const matches = term
    ? data.filter((r) => String(r.payload?.["transfer_number"] ?? "").includes(term) || r.reason.includes(term))
    : data;

  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro
        title="طلبات الحوالات"
        subtitle="اطلب تعديل أو إلغاء أو إيقاف حوالة؛ الطلب ينتظر موافقة المدير ولا يمس الحوالة قبلها."
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
      <Toolbar search={<Input ref={searchRef} placeholder="بحث برقم الحوالة أو السبب" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {open && <RequestForm onDone={() => setOpen(false)} />}
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title={data.length === 0 ? "لا توجد طلبات بعد" : "لا نتائج مطابقة للبحث"}
          hint={data.length === 0 ? "أضف طلبًا برقم الحوالة ونوع الطلب وسببه." : "جرّب رقمًا أو سببًا آخر."}
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
                  <p className="ledger-figures min-w-0 truncate text-sm font-semibold">
                    طلب {TYPE_LABEL[r.request_type]} — حوالة {KIND_LABEL[r.transfer_kind]} رقم {r.payload?.["transfer_number"] ?? r.transfer_id}
                  </p>
                  <StatusPill tone={r.status === "مقبول" ? "ok" : r.status === "مرفوض" ? "bad" : "warn"}>{r.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                {r.request_type === "modify" && r.payload && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      r.payload["receiver_name"] && `المستلم: ${r.payload["receiver_name"]}`,
                      r.payload["receiver_phone"] && `هاتفه: ${r.payload["receiver_phone"]}`,
                      r.payload["sender_name"] && `المرسل: ${r.payload["sender_name"]}`,
                      r.payload["sender_phone"] && `هاتفه: ${r.payload["sender_phone"]}`,
                      r.payload["notes"] && `ملاحظات: ${r.payload["notes"]}`,
                    ].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
              {isManager && r.status === "معلق" && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={async () => { if (await confirmAsk("قبول الطلب وتنفيذه على الحوالة؟")) decide.mutate({ id: r.id, approve: true }); }}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
                  >
                    قبول وتنفيذ
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={async () => { if (await confirmAsk("رفض الطلب؟")) decide.mutate({ id: r.id, approve: false }); }}
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
  const [kind, setKind] = useState<"outgoing" | "incoming">("outgoing");
  const [reqType, setReqType] = useState<"modify" | "cancel" | "stop">("modify");
  const [f, setF] = useState({ transfer_number: "", reason: "", receiver_name: "", receiver_phone: "", sender_name: "", sender_phone: "", notes: "" });

  const m = useMutation({
    mutationFn: async () => {
      const num = Number(f.transfer_number);
      if (!num) throw new Error("أدخل رقم الحوالة");
      const table = kind === "outgoing" ? "outgoing_transfers" : "incoming_transfers";
      const { data: t, error: te } = await supabase.from(table).select("id, canceled, delivered").eq("transfer_number", num).maybeSingle();
      if (te) throw te;
      if (!t) throw new Error("لا توجد حوالة بهذا الرقم");
      if (t.canceled) throw new Error("الحوالة ملغاة مسبقًا");
      if (reqType !== "modify" && t.delivered) throw new Error("الحوالة مصروفة ولا تقبل الإلغاء أو الإيقاف");

      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, string> = { transfer_number: String(num) };
      if (reqType === "modify") {
        for (const k of ["receiver_name", "receiver_phone", "sender_name", "sender_phone", "notes"] as const) {
          if (f[k].trim()) payload[k] = f[k].trim();
        }
        if (Object.keys(payload).length === 1) throw new Error("أدخل قيمة واحدة جديدة على الأقل للتعديل");
      }
      const { error } = await supabase.from("transfer_requests").insert({
        transfer_kind: kind,
        transfer_id: t.id,
        request_type: reqType,
        reason: f.reason.trim(),
        payload,
        requested_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُرسل الطلب وينتظر موافقة المدير");
      qc.invalidateQueries({ queryKey: ["transfer_requests"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الحوالة">
          <div className="flex gap-2">
            {(["outgoing", "incoming"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="نوع الطلب">
          <div className="flex gap-2">
            {(["modify", "cancel", "stop"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setReqType(t)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${reqType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم الحوالة">
          <Input required inputMode="numeric" value={f.transfer_number} onChange={set("transfer_number")} className="ledger-figures" />
        </Field>
        <Field label="سبب الطلب">
          <Input required value={f.reason} onChange={set("reason")} />
        </Field>
      </div>
      {reqType === "modify" && (
        <>
          <p className="text-xs font-semibold text-muted-foreground">القيم الجديدة (اترك ما لا يتغير فارغًا — المبالغ لا تُعدَّل أبدًا):</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="اسم المستلم"><Input value={f.receiver_name} onChange={set("receiver_name")} /></Field>
            <Field label="هاتف المستلم"><Input value={f.receiver_phone} onChange={set("receiver_phone")} className="ledger-figures" /></Field>
            <Field label="اسم المرسل"><Input value={f.sender_name} onChange={set("sender_name")} /></Field>
            <Field label="هاتف المرسل"><Input value={f.sender_phone} onChange={set("sender_phone")} className="ledger-figures" /></Field>
          </div>
          <Field label="ملاحظات"><Input value={f.notes} onChange={set("notes")} /></Field>
        </>
      )}
      <button type="submit" disabled={m.isPending} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {m.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}
      </button>
    </FormCard>
  );
}
