import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { DocumentToolbar, selectedRowCls } from "@/components/document-toolbar";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { allAccountsQuery } from "@/lib/all-accounts-query";
import { partyNetBalances } from "@/lib/all-accounts";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { adenDate } from "@/lib/closing";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoxSelect, boxErrorMessage } from "@/components/box-select";
import { LiveAmountWords } from "@/components/amount-words";
import {
  EmptyState,
  Field,
  FormCard,
  ListItem,
  LoadingRows,
  Notice,
  StatusPill,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { matchCurrencyId } from "@/lib/wa-bot/logic";
import { computeCommission, findRule, type CommissionRule } from "@/lib/commission";
import { fmt, fmtMoney } from "@/lib/money";
import { whatsAppLink } from "@/lib/whatsapp";
import { useWorkDefaults } from "@/hooks/use-work-defaults";
import { useSystemSettings } from "@/hooks/use-system-settings";
import { transferRuleError, payMethodValue } from "@/lib/system-settings";
import { defaultCurrencyId } from "@/lib/staff-defaults";
import { checkCoversTransfer } from "@/lib/transfer-check";
import { blacklistMatch, forbiddenTextMatch } from "@/lib/transfer-setup";
import { MAIN_CENTER, isMainCenter } from "@/lib/internal-transfer";
import { TransferEvidence } from "@/components/transfer-evidence";
import { PayTransfersScreen } from "@/components/transfer-pay";
import { documentNumber } from "@/lib/document-number";
import { pendingResult } from "@/lib/offline/outbox-core";

type Direction = "outgoing" | "incoming";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({ meta: [{ title: "قبض وتوريد الحوالات — ابو طه للصرافة" }, { name: "description", content: "قبض الحوالات الصادرة وتوريد الواردة وتسليمها مع العمولة والصندوق." }, { property: "og:title", content: "قبض وتوريد الحوالات — ابو طه للصرافة" }, { property: "og:description", content: "قبض الحوالات الصادرة وتوريد الواردة وتسليمها مع العمولة والصندوق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  // كل اتجاه شاشة مستقلة تُفتح من أيقونتها: /transfers?dir=outgoing (قبض) و /transfers?dir=incoming (توريد)
  // view=pay: الواردة المعلقة للصرف، view=export: الصادرة لوكيل غير المصدّرة — بدون نموذج إدخال
  // wa=<رقم طلب البوت>: يفتح النموذج معبّأً من طلب واتساب ويربطه بالحوالة بعد الحفظ
  validateSearch: (search: Record<string, unknown>): { dir?: Direction; view?: "pay" | "export"; wa?: number } => ({
    ...(search["dir"] === "incoming" || search["dir"] === "outgoing" ? { dir: search["dir"] as Direction } : {}),
    ...(search["view"] === "pay" || search["view"] === "export" ? { view: search["view"] as "pay" | "export" } : {}),
    ...(Number.isInteger(Number(search["wa"])) && Number(search["wa"]) > 0 ? { wa: Number(search["wa"]) } : {}),
  }),
  component: TransfersScreen,
});

const SCREEN_TEXT: Record<Direction, { title: string; subtitle: string; method: string; empty: string; list?: string }> = {
  outgoing: { title: "قبض حوالة", subtitle: "استلام مبلغ الحوالة من المرسل وتسجيلها صادرة.", method: "طريقة القبض", empty: "لا توجد حوالات مقبوضة بعد" },
  incoming: { title: "توريد حوالة", subtitle: "تسجيل الحوالة الواردة ثم تسليمها للمستلم.", method: "طريقة الصرف", empty: "لا توجد حوالات موردة بعد" },
};

const VIEW_TEXT: Record<"pay" | "export", { title: string; subtitle: string; empty: string; list: string }> = {
  pay: { title: "صرف الحوالات", subtitle: "الحوالات الواردة التي لم تُسلَّم بعد. اختر الحوالة ثم اضغط «تسليم للمستلم».", empty: "لا توجد حوالات واردة تنتظر الصرف", list: "حوالات تنتظر الصرف" },
  export: { title: "تصدير الحوالات", subtitle: "الحوالات الصادرة لوكيل ولم تُصدَّر بعد. اختر الحوالة ثم اضغط «تصدير للوكيل».", empty: "لا توجد حوالات تنتظر التصدير", list: "حوالات تنتظر التصدير" },
};

function TransfersScreen() {
  const { dir: searchDir, view, wa } = Route.useSearch();
  // صرف الحوالات شاشة مستقلة بنمط النظام القديم: النموذج أعلى والمصروفة تحت حسب التاريخ
  if (view === "pay") return <PayTransfersScreen />;
  const dir: Direction = view === "export" ? "outgoing" : searchDir ?? "outgoing";
  const text = view ? { ...SCREEN_TEXT[dir], ...VIEW_TEXT[view] } : SCREEN_TEXT[dir];
  const [open, setOpen] = useState(!view);
  const [formKey, setFormKey] = useState(0);
  const permissions = useScreenPermissions("/transfers");
  const { roles } = useAppRoles();
  const canOperate = roles.some((r) => ["admin", "manager", "teller"].includes(r));
  const canCreate = permissions.can("create") && canOperate;
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const navigate = useNavigate();
  useEffect(() => { setSel(null); setOpen(!view); }, [dir, view]);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState(adenDate());
  const table = dir === "outgoing" ? "outgoing_transfers" : "incoming_transfers";

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: [table, view ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from(table)
        .select("*, currencies!currency_id(currency_name), agents!agent_id(agent_name)");
      if (view) q = q.eq("delivered", false).eq("canceled", false);
      if (view === "export") q = q.is("exported_at", null).not("agent_id", "is", null);
      const { data, error } = await q.order("id", { ascending: false }).limit(view ? 300 : 50);
      if (error) throw error;
      return data;
    },
  });

  const rows = data.filter((t) => (!from || t.the_date >= from) && (!until || t.the_date <= until) && (!search || `${documentNumber(dir, t.document_number)} ${t.transfer_number ?? t.id} ${t.reference_number ?? ""} ${t.sender_name} ${t.receiver_name}`.includes(search)));
  const selected = rows.find((t) => t.id === sel) ?? null;
  const qc = useQueryClient();
  // حذف الحوالة الصادرة من شريط الأوامر: نفس شروط زر «حذف» تحت الحوالة المحددة
  const toolbarDelete = dir === "outgoing" && permissions.can("delete") && canOperate && (!selected || (!selected.delivered && !selected.exported_at && !("check_id" in selected && selected.check_id)));
  const removeSelected = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("delete_outgoing_transfer", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُذفت الحوالة");
      setSel(null);
      for (const key of ["outgoing_transfers", "incoming_transfers", "home", "totals", "box_day_summary", "statement", "all_accounts"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });
  const methodName = (m: string | null) => (m === "account" ? "حساب" : m === "check" ? "شيك" : "نقد");

  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro title={text.title} subtitle={text.subtitle} />
      <DocumentToolbar
        selected={sel != null}
        canCreate={canCreate}
        canDelete={toolbarDelete && !removeSelected.isPending}
        canPrint={permissions.can("print")}
        adding={open && canCreate}
        onAdd={() => setOpen((v) => !v)}
        onDelete={() => { if (selected) removeSelected.mutate(selected.id); }}
        onEdit={() => toast.info("الحوالة المرحّلة لا تُعدّل؛ استخدم «إلغاء» من أزرار الحوالة ثم أعد إدخالها.")}
        onRefresh={() => { void refetch(); toast.success("تم التحديث"); }}
        onSearch={() => document.getElementById("transfer-search")?.focus()}
        onPrintVoucher={() => sel != null && navigate({ to: "/voucher/$kind/$id", params: { kind: dir, id: String(sel) } })}
      />
      {open && canCreate && <TransferForm key={`${dir}-${formKey}-${wa ?? ""}`} dir={dir} waItemId={formKey === 0 ? wa : undefined} onDone={() => { setFormKey((k) => k + 1); if (wa) void navigate({ to: "/transfers", search: { dir }, replace: true }); }} />}

      <section className="mb-4 rounded-xl border border-border bg-card shadow-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-primary">
            <span className="h-3.5 w-1 rounded-full bg-gold" />
            {text.list ?? (dir === "outgoing" ? "الحوالات المقبوضة" : "الحوالات الموردة")}
          </h2>
          <span className="ledger-figures rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{rows.length}</span>
        </header>
        <div className="grid gap-2 p-3">
          <Field label="بحث"><Input id="transfer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الحوالة أو المرجع أو الاسم" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="من تاريخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field></div>
        </div>
        {isLoading ? (
          <div className="p-3"><LoadingRows rows={3} /></div>
        ) : rows.length === 0 ? (
          <div className="p-3">
            <EmptyState icon={ArrowLeftRight} title={text.empty} hint={view ? "كل الحوالات المعلقة في هذه القائمة تمت معالجتها." : "الحوالة التي تحفظها من النموذج بالأعلى تظهر هنا مباشرة."} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <thead>
                <tr className="bg-navy text-navy-foreground">
                  {["رقم السند", "الحالة", text.method, "الجهة", "مبلغ الحوالة", "العملة", "المستلم", "هاتف المستلم", "المرسل", "الوكيل", "التاريخ"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 text-start font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const isSel = sel === t.id;
                  return (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      aria-selected={isSel}
                      onClick={() => setSel(isSel ? null : t.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setSel(isSel ? null : t.id); }}
                      className={`cursor-pointer border-b border-border/70 transition-colors ${isSel ? "bg-gold/20" : i % 2 ? "bg-muted/40" : "bg-card"} hover:bg-primary/5`}
                    >
                      <td className="ledger-figures whitespace-nowrap px-2 py-2 font-semibold text-primary">{documentNumber(dir, t.document_number)}</td>
                      <td className="px-2 py-2"><StatusPill tone={t.canceled ? "bad" : t.delivered ? "ok" : "warn"}>{t.canceled ? "ملغاة" : t.delivered ? "مسلّمة" : t.state ?? "معلقة"}</StatusPill></td>
                      <td className="whitespace-nowrap px-2 py-2">{methodName(t.payment_method)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{t.destination_name || "—"}</td>
                      <td className="ledger-figures whitespace-nowrap px-2 py-2 font-bold">{fmt(t.amount)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{(t.currencies as { currency_name: string } | null)?.currency_name ?? ""}</td>
                      <td className="whitespace-nowrap px-2 py-2">{t.receiver_name}</td>
                      <td className="ledger-figures whitespace-nowrap px-2 py-2">{t.receiver_phone || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2">{t.sender_name}</td>
                      <td className="whitespace-nowrap px-2 py-2">{(t.agents as { agent_name: string } | null)?.agent_name ?? "—"}</td>
                      <td className="ledger-figures whitespace-nowrap px-2 py-2">{t.the_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <ListItem className={selectedRowCls}>
          <div className="flex items-center justify-between gap-2">
            <p className="ledger-figures text-sm font-bold text-primary">الحوالة المحددة: {documentNumber(dir, selected.document_number)}</p>
            <span className="ledger-figures text-sm font-semibold">{fmtMoney(selected.amount, (selected.currencies as { currency_name: string } | null)?.currency_name)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{selected.sender_name} ← {selected.receiver_name} · رقم الوكيل: <span className="ledger-figures">{selected.transfer_number ?? selected.id}</span>{selected.exported_at ? " · مصدّرة" : ""}</p>
          <TransferActions dir={dir} t={selected} internal={"is_internal" in selected ? selected.is_internal : "internal_outgoing_id" in selected && selected.internal_outgoing_id !== null} />
        </ListItem>
      ) : rows.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">اضغط على أي حوالة في الجدول لتظهر أزرارها: التسليم، الإلغاء، السند، وإشعار واتساب.</p>
      ) : null}
    </>
  );
}

function TransferActions({ dir, t, internal }: { dir: Direction; internal: boolean; t: { document_number: number | null; id: number; delivered: boolean; canceled: boolean; transfer_number: number | null; amount: number | string; sender_phone: string | null; receiver_phone: string | null; currencies: { currency_name: string } | null; agent_id: number | null; exported_at: string | null } }) {
  const qc = useQueryClient();
  const { isManager, roles } = useAppRoles();
  const permissions = useScreenPermissions("/transfers");
  const canUpdate = permissions.can("update") && roles.some((r) => ["admin", "manager", "teller"].includes(r));
  const [method, setMethod] = useState("cash");
  const [customer, setCustomer] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["transfer-customers"], queryFn: async () => { const { data, error } = await supabase.from("customers").select("id, full_name, account_id").not("account_id", "is", null); if (error) throw error; return data; } });
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [box, setBox] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const table = dir === "outgoing" ? "outgoing_transfers" : "incoming_transfers";
  const pending = !t.delivered && !t.canceled;

  // إشعار واتساب: للمستلم في الصادرة، وللمرسل في الواردة
  const notifyPhone = dir === "outgoing" ? t.receiver_phone : t.sender_phone;
  const notifyText = `حوالة ${dir === "outgoing" ? "صادرة" : "واردة"} رقم ${documentNumber(dir, t.document_number)} بمبلغ ${fmt(t.amount)} ${t.currencies?.currency_name ?? ""} — ${t.canceled ? "ملغاة" : t.delivered ? "سُلّمت" : "قيد المتابعة"}`;
  const notifyUrl = notifyPhone ? whatsAppLink(notifyPhone, notifyText) : null;

  const update = useMutation({
    mutationFn: async (patch: { delivered?: boolean; canceled?: boolean; box_id?: number; receiver_id_number?: string | null; payment_method?: string; customer_id?: number | null; exported_at?: string; export_agent_id?: number | null }) => {
      const { receiver_id_number: _ignored, ...common } = patch;
      const { error } =
        dir === "outgoing"
          ? await supabase.from("outgoing_transfers").update(common).eq("id", t.id)
          : await supabase.from("incoming_transfers").update(patch).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: (_d, patch) => {
      toast.success(patch.canceled ? "أُلغيت الحوالة" : patch.exported_at ? "صُدّرت الحوالة للوكيل" : "سُجّل التسليم");
      setDeliverOpen(false);
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
      qc.invalidateQueries({ queryKey: ["outgoing_transfers"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["totals"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
      qc.invalidateQueries({ queryKey: ["all_accounts"] });
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_outgoing_transfer", { p_id: t.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُذفت الحوالة");
      for (const key of ["outgoing_transfers", "incoming_transfers", "home", "totals", "box_day_summary", "statement", "all_accounts"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });
  const canDelete = dir === "outgoing" && permissions.can("delete") && !t.delivered && !("exported_at" in t && t.exported_at) && !("check_id" in t && t.check_id);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pending && canUpdate && permissions.can("deliver") && dir === "incoming" && (
          <Button type="button" onClick={() => setDeliverOpen((v) => !v)} className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            {deliverOpen ? "إغلاق" : "تسليم للمستلم"}
          </Button>
        )}
        {pending && canUpdate && permissions.can("deliver") && dir === "outgoing" && !internal && (
          <Button
            type="button"
            disabled={update.isPending}
            onClick={() => confirmOperation("تسجيل تسليم الحوالة بواسطة الوكيل", () => update.mutate({ delivered: true }))}
            className="rounded-lg border border-primary/40 px-3 py-1 text-xs font-medium text-primary"
          >
            سلّمها الوكيل
          </Button>
        )}
        {pending && canUpdate && permissions.can("cancel") && isManager && !(internal && dir === "incoming") && (
          <Button
            type="button"
            disabled={update.isPending}
            onClick={async () => { if (await confirmAsk("إلغاء الحوالة؟ يُرد المبلغ من الصندوق إن كان مقبوضًا فيه.")) update.mutate({ canceled: true }); }}
            className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive"
          >
            إلغاء
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            disabled={remove.isPending}
            onClick={async () => { if (await confirmAsk("حذف الحوالة نهائيًا؟ يُعكس أثرها من الصندوق أو حساب العميل.")) remove.mutate(); }}
            className="rounded-lg border border-destructive/40 bg-transparent px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />حذف
          </Button>
        )}
        {permissions.can("print") && <Link
          to="/voucher/$kind/$id"
          params={{ kind: dir, id: String(t.id) }}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary"
        >
          سند
        </Link>}
        {notifyUrl && permissions.can("whatsapp") && (
          <a
            href={notifyUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="إشعار واتساب"
            className="rounded-lg border border-positive/40 px-3 py-1 text-xs font-medium text-positive"
          >
            إشعار واتساب
          </a>
        )}
      </div>
      {pending && canUpdate && permissions.can("export") && dir === "outgoing" && !internal && !t.exported_at && t.agent_id && <Button className="mt-2" variant="outline" size="sm" disabled={update.isPending} onClick={() => confirmOperation("تصدير الحوالة للوكيل", () => update.mutate({ exported_at: new Date().toISOString(), export_agent_id: t.agent_id }))}>تصدير للوكيل</Button>}
      {pending && internal && dir === "outgoing" && <Button variant="outline" size="sm" asChild><Link to="/transfers" search={{ dir: "incoming" }}>صرف الحوالة الداخلية</Link></Button>}
      {deliverOpen && (
        <FormCard
          className="mt-2 mb-0"
          onSubmit={(e) => { e.preventDefault(); update.mutate({ delivered: true, ...(method === "cash" ? { box_id: Number(box) } : {}), payment_method: method, customer_id: method === "account" ? Number(customer) : null, receiver_id_number: idNumber.trim() || null }); }}
        >
          <Field label="طريقة الصرف"><select className={selectCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقد</option><option value="account">حساب</option></select></Field>
          {method === "cash" ? <BoxSelect required value={box} onChange={setBox} label="يُصرف من صندوق" /> : <Field label="حساب المستلم"><select required className={selectCls} value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">اختر العميل</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>}
          <Field label="رقم هوية المستلم">
            <Input placeholder="اختياري" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="ledger-figures" />
          </Field>
          <Button type="submit" size="sm" disabled={update.isPending || (method === "cash" ? !box : !customer)}>تأكيد التسليم وصرف المبلغ</Button>
        </FormCard>
      )}
      <TransferEvidence direction={dir} id={t.id} />
    </div>
  );
}

function TransferForm({ dir, onDone, waItemId }: { dir: Direction; onDone: () => void; waItemId?: number | undefined }) {
  const qc = useQueryClient();
  const { data: defaults } = useWorkDefaults();
  const setting = useSystemSettings();
  const table = dir === "outgoing" ? "outgoing_transfers" : "incoming_transfers";
  const [f, setF] = useState({
    number: "", amount: "", currency_id: "", agent_id: "",
    sender: "", sender_phone: "", receiver: "", receiver_phone: "",
    commission: "", notes: "", box_id: "", method: "cash", customer_id: "", check_id: "", source: "", destination: dir === "outgoing" ? MAIN_CENTER : "", reference: "", purpose: "", date: adenDate(), identity: "", country_id: "", governorate_id: "", area_id: "",
  });
  const setBox = (v: string) => setF((p) => ({ ...p, box_id: v }));
  const defaultMethod = payMethodValue(setting("trf.default_receipt_method"));
  useEffect(() => { setF((p) => ({ ...p, method: defaultMethod })); }, [defaultMethod]);

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const localId = currencies[0]?.id;
  const { data: rates } = useQuery({
    queryKey: ["latest_rates", localId],
    enabled: localId != null,
    queryFn: async () => {
      if (localId == null) return new Map<number, number>();
      const { data, error } = await supabase
        .from("currency_prices")
        .select("source_currency_id, exchange_price, updated_at")
        .eq("target_currency_id", localId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const m = new Map<number, number>();
      for (const r of data) if (!m.has(r.source_currency_id)) m.set(r.source_currency_id, Number(r.exchange_price));
      return m;
    },
  });
  useEffect(() => {
    const currency = defaultCurrencyId(defaults?.currency_id, currencies);
    if (currency) setF((previous) => previous.currency_id && !defaults?.enforce_currency ? previous : { ...previous, currency_id: currency });
  }, [defaults, currencies]);
  // تعبئة النموذج من طلب بوت واتساب؛ الموظف يراجع كل الحقول ثم يحفظ بنفسه
  const { data: waItem } = useQuery({
    queryKey: ["wa-item-prefill", waItemId],
    enabled: waItemId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_items").select("id, kind, status, amount, currency, transfer_number, summary, data, posted_id, wa_contacts(display_name, role, agent_id, customer_id)").eq("id", waItemId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [waApplied, setWaApplied] = useState(false);
  useEffect(() => {
    if (!waItem || waApplied || !currencies.length) return;
    setWaApplied(true);
    const d = (waItem.data ?? {}) as { sender?: string | null; receiver?: string | null };
    const contact = waItem.wa_contacts;
    const currency = matchCurrencyId(waItem.currency, currencies);
    setF((p) => ({
      ...p,
      amount: waItem.amount != null ? String(waItem.amount) : p.amount,
      currency_id: currency && !defaults?.enforce_currency ? String(currency) : p.currency_id,
      sender: d.sender ?? p.sender,
      receiver: d.receiver ?? p.receiver,
      reference: waItem.transfer_number ?? p.reference,
      agent_id: contact?.role === "exchanger" && contact.agent_id ? String(contact.agent_id) : p.agent_id,
      notes: [`من بوت واتساب #${waItem.id}`, waItem.summary].filter(Boolean).join(" — ").slice(0, 300),
    }));
  }, [waItem, waApplied, currencies, defaults?.enforce_currency, dir]);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, agent_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["commission_rules_engine"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commission_rules").select("*");
      if (error) throw error;
      return data as CommissionRule[];
    },
  });
  const { data: customers = [] } = useQuery({ queryKey: ["transfer-customers"], queryFn: async () => { const { data, error } = await supabase.from("customers").select("id, full_name, account_id").not("account_id", "is", null); if (error) throw error; return data; } });
  const { data: countries = [] } = useQuery({ queryKey: ["countries"], queryFn: async () => { const { data, error } = await supabase.from("countries").select("id, country_name").eq("active", true).order("the_number"); if (error) throw error; return data ?? []; } });
  const { data: governorates = [] } = useQuery({ queryKey: ["governorates"], queryFn: async () => { const { data, error } = await supabase.from("governorates").select("id, governorate_name, country_id").eq("active", true).order("the_number"); if (error) throw error; return data ?? []; } });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: async () => { const { data, error } = await supabase.from("areas").select("id, area_name, governorate_id").eq("active", true).order("the_number"); if (error) throw error; return data ?? []; } });
  const { data: purposes = [] } = useQuery({ queryKey: ["transfer-purposes"], queryFn: async () => { const { data, error } = await supabase.from("transfer_purposes").select("purpose_name").eq("active", true).order("the_number"); if (error) throw error; return data ?? []; } });
  const { data: blacklist = [] } = useQuery({ queryKey: ["blacklist"], queryFn: async () => { const { data, error } = await supabase.from("blacklist").select("full_name, identity_number, phone_number, reason"); if (error) throw error; return data ?? []; } });
  const senderBlacklisted = blacklistMatch(f.sender, f.sender_phone, "", blacklist);
  const receiverBlacklisted = blacklistMatch(f.receiver, f.receiver_phone, f.identity, blacklist);
  const { data: forbidden = [] } = useQuery({ queryKey: ["forbidden-texts"], queryFn: async () => { const { data, error } = await supabase.from("forbidden_texts").select("forbidden_text").eq("active", true); if (error) throw error; return (data ?? []).map((r) => r.forbidden_text); } });
  const forbiddenHit = forbiddenTextMatch([f.sender, f.receiver, f.notes, f.purpose, f.source, f.destination], forbidden);
  const rule = f.amount
    ? findRule(rules, {
        documentType: dir,
        amount: Number(f.amount),
        currencyId: f.currency_id ? Number(f.currency_id) : null,
        agentId: f.agent_id ? Number(f.agent_id) : null,
      })
    : null;
  const autoCommission = rule ? computeCommission(rule, Number(f.amount)) : null;
  const curId = Number(f.currency_id);
  const rate = curId && curId !== localId ? rates?.get(curId) : undefined;
  const localTotal = f.amount && rate ? Number(f.amount) * rate : null;
  const refKey = f.reference.trim();
  const { data: dupRef = false } = useQuery({
    queryKey: ["dup-ref", table, refKey],
    enabled: refKey.length >= 3,
    queryFn: async () => {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("reference_number", refKey);
      if (error) return false;
      return (count ?? 0) > 0;
    },
  });
  const { data: checks = [] } = useQuery({ queryKey: ["transfer-check-options"], queryFn: async () => {
    const [checksResult, transfersResult] = await Promise.all([supabase.from("checks").select("id, check_number, amount, currency_id, check_type, status, customer_id").eq("check_type", "وارد").neq("status", "مرتجع"), supabase.from("outgoing_transfers").select("check_id").not("check_id", "is", null)]);
    if (checksResult.error) throw checksResult.error;
    if (transfersResult.error) throw transfersResult.error;
    return checksResult.data.filter((check) => !transfersResult.data.some((t) => t.check_id === check.id));
  } });

  const m = useMutation({
    mutationFn: async () => {
      const fields = {
        the_date: f.date, payment_method: dir === "outgoing" ? f.method : "cash", customer_id: dir === "outgoing" && f.method === "account" ? Number(f.customer_id) : null, source_name: f.source.trim() || null, destination_name: f.destination.trim() || null, reference_number: f.reference.trim() || null, transfer_purpose: f.purpose.trim() || null, receiver_identity_number: f.identity.trim() || null, branch_id: defaults?.branch_id ?? null,
        country_id: f.country_id ? Number(f.country_id) : null,
        governorate_id: f.governorate_id ? Number(f.governorate_id) : null,
        area_id: f.area_id ? Number(f.area_id) : null,
        transfer_number: f.number ? Number(f.number) : null,
        amount: Number(f.amount),
        currency_id: Number(f.currency_id),
        agent_id: isMainCenter(f.destination) ? null : f.agent_id ? Number(f.agent_id) : null,
        sender_name: f.sender.trim(),
        sender_phone: f.sender_phone.trim(),
        receiver_name: f.receiver.trim(),
        receiver_phone: f.receiver_phone.trim(),
        branch_commission: f.commission ? Number(f.commission) : (autoCommission ?? 0),
        commission_currency_id: f.currency_id ? Number(f.currency_id) : null,
        box_id: dir === "outgoing" && f.method === "cash" && f.box_id ? Number(f.box_id) : null,
        notes: f.notes.trim() || null,
      };
      if (waItemId != null) {
        if (!navigator.onLine) throw new Error("يلزم الاتصال لحفظ حوالة من طلب البوت");
        if (waItem?.posted_id != null) throw new Error("طلب البوت هذا محفوظ كحوالة مسبقًا");
      }
      const { data, error } = dir === "outgoing"
        ? await supabase.from("outgoing_transfers").insert({ ...fields, is_internal: isMainCenter(f.destination), check_id: f.method === "check" ? Number(f.check_id) : null }).select("id").setHeader("x-offline-intent", "true")
        : await supabase.from("incoming_transfers").insert(fields).select("id").setHeader("x-offline-intent", "true");
      if (error) throw error;
      const pending = pendingResult(data);
      const newId = Array.isArray(data) ? (data[0] as { id?: number } | undefined)?.id : undefined;
      let waLinked: boolean | null = null;
      if (waItemId != null && !pending && newId != null) {
        const link = await supabase.rpc("link_wa_item_transfer", { p_item: waItemId, p_table: table, p_transfer: newId });
        waLinked = !link.error;
      }
      return { pending, waLinked };
    },
    onSuccess: ({ pending, waLinked }) => {
      if (waLinked === true) { toast.success("رُبط طلب البوت بالحوالة"); qc.invalidateQueries({ queryKey: ["wa-items"] }); }
      if (waLinked === false) toast.warning("حُفظت الحوالة لكن تعذّر ربطها بطلب البوت؛ لا تحفظها مرة أخرى.");
      if (pending) toast.info("حُفظت الحوالة على الهاتف بانتظار الإرسال؛ لم تُرحّل ولم يتغير الرصيد. راجع قائمة المزامنة.");
      else toast.success(dir === "outgoing" && isMainCenter(f.destination) ? "حُفظت الحوالة وأُدرجت معلّقة في صرف الحوالات" : "حُفظت الحوالة");
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
      qc.invalidateQueries({ queryKey: ["outgoing_transfers"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["totals"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      onDone();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const currencyName = currencies.find((c) => c.id === Number(f.currency_id))?.currency_name ?? "";
  const commissionValue = f.commission ? Number(f.commission) : (autoCommission ?? 0);
  const totalWithCommission = f.amount ? Number(f.amount) + commissionValue : null;

  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); const err = transferRuleError(setting, { ...f, amount: Number(f.amount) }, dir); if (err) { toast.error(err); return; } m.mutate(); }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-primary">{dir === "outgoing" ? "بيانات قبض الحوالة" : "بيانات توريد الحوالة"}</h2>
        <div className="w-40"><Field label="التاريخ"><Input required type="date" value={f.date} onChange={set("date")} /></Field></div>
      </div>
      <InputSettings />
      {waItemId != null && (waItem?.posted_id != null
        ? <Notice tone="warn">طلب البوت #{waItemId} محفوظ كحوالة مسبقًا؛ لا تحفظه مرة أخرى.</Notice>
        : <Notice>معبّأ من طلب بوت واتساب <span className="ledger-figures">#{waItemId}</span>{waItem?.wa_contacts?.display_name ? ` (${waItem.wa_contacts.display_name})` : ""}. راجع المبلغ والعملة والأسماء ثم احفظ.</Notice>)}

      <FormGroup title="الحوالة">
        <div className="grid grid-cols-2 gap-2">
          <Field label="مبلغ الحوالة">
            <Input required inputMode="decimal" placeholder="0" value={f.amount} onChange={set("amount")} className="ledger-figures" />
          </Field>
          <Field label="عملة الحوالة">
            <select required disabled={defaults?.enforce_currency} className={selectCls} value={f.currency_id} onChange={set("currency_id")}>
              <option value="">اختر العملة</option>
              {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
            </select>
          </Field>
        </div>
        <LiveAmountWords amount={f.amount} currencyName={currencyName} />
        {localTotal != null && (
          <p className="text-xs text-muted-foreground">
            يعادل بالعملة المحلية: <span className="ledger-figures font-bold">{fmt(localTotal)}</span> {currencies[0]?.currency_name}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="الجهة">{dir === "outgoing" ? <select aria-label="الجهة" className={selectCls} value={isMainCenter(f.destination) ? MAIN_CENTER : ""} onChange={(e) => setF({ ...f, destination: e.target.value, agent_id: "" })}><option value={MAIN_CENTER}>{MAIN_CENTER}</option><option value="">حوالة لوكيل</option></select> : <Input value={f.destination} onChange={set("destination")} />}</Field>
          <Field label="الوكيل">
            <select disabled={dir === "outgoing" && isMainCenter(f.destination)} className={selectCls} value={f.agent_id} onChange={set("agent_id")}>
              <option value="">بدون وكيل</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.agent_name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="رقم الحوالة">
            <Input inputMode="numeric" placeholder="تلقائي" value={f.number} onChange={set("number")} className="ledger-figures" />
          </Field>
          <Field label="الرقم المرجعي"><Input value={f.reference} onChange={set("reference")} className="ledger-figures" /></Field>
        </div>
        {dupRef && <Notice tone="warn">هذا الرقم المرجعي مسجّل من قبل في حوالة أخرى — تأكد قبل الحفظ.</Notice>}
        <div className="grid grid-cols-3 gap-2">
          <Field label="الدولة">
            <select className={selectCls} value={f.country_id} onChange={(e) => setF({ ...f, country_id: e.target.value, governorate_id: "", area_id: "" })}>
              <option value="">بدون</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.country_name}</option>)}
            </select>
          </Field>
          <Field label="المحافظة">
            <select className={selectCls} value={f.governorate_id} onChange={(e) => setF({ ...f, governorate_id: e.target.value, area_id: "" })}>
              <option value="">بدون</option>
              {governorates.filter((g) => !f.country_id || g.country_id === Number(f.country_id)).map((g) => <option key={g.id} value={g.id}>{g.governorate_name}</option>)}
            </select>
          </Field>
          <Field label="المنطقة">
            <select className={selectCls} value={f.area_id} onChange={set("area_id")}>
              <option value="">بدون</option>
              {areas.filter((a) => !f.governorate_id || a.governorate_id === Number(f.governorate_id)).map((a) => <option key={a.id} value={a.id}>{a.area_name}</option>)}
            </select>
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="المستلم والمرسل">
        <div className="grid grid-cols-2 gap-2">
          <Field label="المستلم">
            <Input required placeholder="الاسم الكامل" value={f.receiver} onChange={set("receiver")} />
          </Field>
          <Field label="هاتف المستلم">
            <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.receiver_phone} onChange={set("receiver_phone")} className="ledger-figures" />
          </Field>
        </div>
        {receiverBlacklisted && <Notice tone="warn">المستلم <span className="font-semibold">{receiverBlacklisted.full_name}</span> في القائمة السوداء{receiverBlacklisted.reason ? ` — ${receiverBlacklisted.reason}` : ""}.</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="المرسل">
            <Input required placeholder="الاسم الكامل" value={f.sender} onChange={set("sender")} />
          </Field>
          <Field label="هاتف المرسل">
            <Input inputMode="tel" placeholder="07xxxxxxxx" value={f.sender_phone} onChange={set("sender_phone")} className="ledger-figures" />
          </Field>
        </div>
        {senderBlacklisted && <Notice tone="warn">المرسل <span className="font-semibold">{senderBlacklisted.full_name}</span> في القائمة السوداء{senderBlacklisted.reason ? ` — ${senderBlacklisted.reason}` : ""}.</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="غرض التحويل">
            <Input value={f.purpose} onChange={set("purpose")} list="transfer-purpose-options" />
            <datalist id="transfer-purpose-options">
              {purposes.map((p) => <option key={p.purpose_name} value={p.purpose_name} />)}
            </datalist>
          </Field>
          <Field label="رقم هوية المستلم"><Input value={f.identity} onChange={set("identity")} className="ledger-figures" /></Field>
        </div>
        <Field label="مصدر الأموال"><Input value={f.source} onChange={set("source")} /></Field>
        {forbiddenHit && <Notice tone="warn">بيانات الحوالة تحتوي نصًا ممنوعًا: <span className="font-semibold">{forbiddenHit}</span>.</Notice>}
      </FormGroup>

      <FormGroup title="العمولة">
        <div className="grid grid-cols-2 gap-2">
          <Field label="إجمالي العمولة">
            <Input inputMode="decimal" placeholder={autoCommission != null ? `التلقائية: ${fmt(autoCommission)}` : "اختياري"} value={f.commission} onChange={set("commission")} className="ledger-figures" />
          </Field>
          <Field label="الإجمالي مع العمولة">
            <Input readOnly tabIndex={-1} value={totalWithCommission != null ? fmt(totalWithCommission) : ""} className="ledger-figures bg-muted font-bold" />
          </Field>
        </div>
        {autoCommission != null && !f.commission && (
          <Notice tone="info">ستُحفظ العمولة <span className="ledger-figures">{fmt(autoCommission)}</span> حسب نظام العمولات.</Notice>
        )}
      </FormGroup>

      {dir === "outgoing" && (
        <FormGroup title="القبض">
          <Field label="طريقة القبض"><select className={selectCls} value={f.method} onChange={set("method")}><option value="cash">نقد</option><option value="check">شيك</option><option value="account">حساب</option></select></Field>
          {f.method === "cash" ? <BoxSelect required value={f.box_id} onChange={setBox} label="يُقبض في صندوق" /> : f.method === "check" ? <>
            <Field label="الشيك الوارد"><select required className={selectCls} value={f.check_id} onChange={set("check_id")}><option value="">اختر شيكًا مسجلًا</option>{checks.filter((check) => checkCoversTransfer(check, Number(f.amount), f.commission ? Number(f.commission) : autoCommission ?? 0, Number(f.currency_id))).map((check) => <option key={check.id} value={check.id}>{check.check_number} · {fmt(check.amount)} · {check.status}</option>)}</select></Field>
            <Button variant="outline" asChild><Link to="/checks">تسجيل شيك</Link></Button>
            <Notice tone="info">يمكن تصدير الحوالة قبل التحصيل. قيمة الشيك تشمل المبلغ والعمولة، ولا تُقبض نقدًا إلا عند التحصيل.</Notice>
          </> : <><Field label="حساب العميل"><select required className={selectCls} value={f.customer_id} onChange={set("customer_id")}><option value="">اختر العميل</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field><CustomerBalance customerId={Number(f.customer_id)} nameOf={(id) => currencies.find((c) => c.id === id)?.currency_name ?? ""} /><Notice tone="info">المبلغ والعمولة يُخصمان من حساب العميل، ولا تدخل نقدية إلى الصندوق.</Notice></>}
        </FormGroup>
      )}

      <Field label="ملاحظات">
        <Input placeholder="بيان إضافي" value={f.notes} onChange={set("notes")} />
      </Field>
      <Button type="submit" disabled={m.isPending}>{dir === "outgoing" ? "حفظ قبض الحوالة" : "حفظ توريد الحوالة"}</Button>
    </FormCard>
  );
}

/** مجموعة حقول بعنوان، مثل أقسام شاشة الحوالات في البرنامج القديم. */
function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3 pt-2">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-bold text-primary">
        <span className="h-3 w-1 rounded-full bg-gold" />
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** «ضبط المدخلات» بنمط هولجن: حجم خط الحقول ولونها، محفوظ على هذا الجهاز. */
function InputSettings() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(16);
  const [tint, setTint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("abutaha-input-prefs") || "{}");
      if (s.size) setSize(s.size);
      if (s.tint) setTint(true);
    } catch { /* تجاهل */ }
  }, []);
  useEffect(() => {
    localStorage.setItem("abutaha-input-prefs", JSON.stringify({ size, tint }));
    const form = ref.current?.closest("form");
    form?.style.setProperty("--field-size", `${size}px`);
    form?.toggleAttribute("data-tint", tint);
  }, [size, tint]);
  return (
    <div ref={ref} className="rounded-lg border border-border p-2">
      <button type="button" className="w-full text-start text-sm font-bold" onClick={() => setOpen((v) => !v)}>
        ⚙ ضبط المدخلات
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>حجم خط الحقول</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setSize((s) => Math.max(12, s - 1))}>−</Button>
              <span className="ledger-figures w-8 text-center">{size}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setSize((s) => Math.min(24, s + 1))}>+</Button>
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span>لون الحقول</span>
            <input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} />
          </label>
        </div>
      )}
    </div>
  );
}

/** رصيد العميل الحالي بكل عملة، يظهر أول ما يُختار العميل وقبل الحفظ. */
function CustomerBalance({ customerId, nameOf }: { customerId: number; nameOf: (id: number) => string }) {
  const { data } = useQuery(allAccountsQuery);
  if (!customerId || !data) return null;
  const rows = partyNetBalances(data, "", adenDate()).filter((r) => r.kind === "customer" && r.id === customerId && r.net !== 0);
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-sm">
      <p className="mb-1 text-xs text-muted-foreground">رصيد العميل الحالي</p>
      {rows.length === 0 ? <p>لا يوجد رصيد</p> : rows.map((r) => (
        <p key={r.currency_id}><span className="ledger-figures font-bold">{fmt(Math.abs(r.net))}</span> {nameOf(r.currency_id)} — {r.net > 0 ? "عليه" : "له"}</p>
      ))}
    </div>
  );
}
