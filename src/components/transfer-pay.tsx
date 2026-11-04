import { confirmAsk } from "@/components/confirm-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeftRight, IdCard } from "lucide-react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoxSelect, boxErrorMessage } from "@/components/box-select";
import { TransferEvidence } from "@/components/transfer-evidence";
import {
  DataTable,
  EmptyState,
  Field,
  FormCard,
  LoadingRows,
  Notice,
  StatusPill,
  Td,
  Tr,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { useSystemSettings } from "@/hooks/use-system-settings";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtMoney } from "@/lib/money";
import { whatsAppLink } from "@/lib/whatsapp";
import { payMethodValue } from "@/lib/system-settings";
import { documentNumber } from "@/lib/document-number";
import { adenDate } from "@/lib/closing";
import { chooserMatch, filterPayByDate, isPayable, payRowSearchText, type PayRow } from "@/lib/transfer-pay";

/** حوالة واردة كما تُقرأ في شاشة الصرف، مع أسماء العملة والصندوق والعميل المضممة. */
export type PayTransferRow = PayRow & {
  payment_method: string | null;
  receiver_phone: string | null;
  sender_phone: string | null;
  receiver_identity_number: string | null;
  receiver_id_number: string | null;
  notes: string | null;
  destination_name: string | null;
  internal_outgoing_id: number | null;
  customer_id: number | null;
  box_id: number | null;
  currencies: { currency_name: string } | null;
  agents: { agent_name: string } | null;
  boxes: { box_name: string } | null;
  customers: { full_name: string } | null;
};

const SELECT = "*, currencies!currency_id(currency_name), agents!agent_id(agent_name), boxes!box_id(box_name), customers!customer_id(full_name)";

const methodName = (m: string | null) => (m === "account" ? "حساب" : m === "check" ? "شيك" : "نقد");

/**
 * شاشة صرف الحوالات بنمط النظام القديم: بيان الحوالة المعلقة أعلى بعد «إيجاد حوالة»،
 * وبطاقة المستلم بجانب الصرف، والحوالات المصروفة تحت النموذج حسب التاريخ المحدد.
 */
export function PayTransfersScreen() {
  const navigate = useNavigate();
  const permissions = useScreenPermissions("/transfers");
  const { roles, isManager } = useAppRoles();
  const canOperate = roles.some((r) => ["admin", "manager", "teller"].includes(r));
  const canDeliver = permissions.can("update") && permissions.can("deliver") && canOperate;
  const canCancel = permissions.can("cancel") && isManager;

  const setting = useSystemSettings();
  const autoChoose = setting("trf.auto_show_choose") === true;
  const showAllOnOpen = setting("trf.show_all_on_open") === true;
  const cardBeforePrint = setting("trf.show_card_before_print") === true;
  const searchMode = String(setting("trf.search_mode"));

  const [chosen, setChosen] = useState<PayTransferRow | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [cardRow, setCardRow] = useState<PayTransferRow | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [chooserSearch, setChooserSearch] = useState("");

  useEffect(() => { if (autoChoose) setChooseOpen(true); }, [autoChoose]);

  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["incoming_transfers", "pay-screen"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_transfers")
        .select(SELECT)
        .order("id", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as PayTransferRow[];
    },
  });

  const payables = rows.filter(isPayable);
  const paid = rows.filter((t) => t.delivered && !t.canceled);
  const chooserRows = showAllOnOpen ? rows : payables;
  const chooserHits = chooserRows.filter((t) => chooserMatch(chooserSearch, payRowSearchText(t), searchMode));

  // الحوالات المصروفة تحت النموذج، محصورة بالتاريخ المحدد
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState(adenDate());
  const [paidSearch, setPaidSearch] = useState("");
  const paidRows = filterPayByDate(
    paid.filter((t) => !paidSearch || payRowSearchText(t).includes(paidSearch.trim())),
    from,
    until,
  );

  const openCard = (t: PayTransferRow) => { setCardRow(t); setCardOpen(true); };
  const printVoucher = (t: PayTransferRow) => {
    // إعداد «عرض بطاقة المستلم قبل طباعة سند صرف الحوالة»
    if (cardBeforePrint && !t.delivered) { openCard(t); return; }
    navigate({ to: "/voucher/$kind/$id", params: { kind: "incoming", id: String(t.id) } });
  };

  return (
    <>
      <MenuStrip tab="/transfers" />
      <SectionIntro
        title="صرف الحوالات"
        subtitle="اضغط «إيجاد حوالة» لتحميل الحوالة المعلقة، أدخل بيانات الصرف ثم احفظ — والحوالات المصروفة تظهر تحت النموذج حسب التاريخ المحدد."
      />

      <div className="mb-3 flex items-center justify-between gap-2" role="toolbar" aria-label="أوامر صرف الحوالات">
        <Button type="button" onClick={() => setChooseOpen((v) => !v)} className="rounded-full px-5 shadow-float">
          {chooseOpen ? "إغلاق الاختيار" : "إيجاد حوالة"}
        </Button>
        <Button type="button" variant="outline" onClick={() => { void refetch(); toast.success("تم التحديث"); }} className="rounded-full px-5">
          تحديث
        </Button>
      </div>

      {chooseOpen && (
        <section className="mb-4 rounded-xl border border-border bg-card shadow-card">
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <span className="h-3.5 w-1 rounded-full bg-gold" />
              إيجاد حوالة — {showAllOnOpen ? "كل الحوالات" : "الحوالات المعلقة"}
            </h2>
            <span className="ledger-figures rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{chooserHits.length}</span>
          </header>
          <div className="grid gap-2 p-3">
            <Field label="بحث"><Input id="pay-chooser-search" value={chooserSearch} onChange={(e) => setChooserSearch(e.target.value)} placeholder="رقم السند أو الحوالة أو اسم المستلم أو المرسل" /></Field>
          </div>
          {isLoading ? (
            <div className="p-3"><LoadingRows rows={3} /></div>
          ) : chooserHits.length === 0 ? (
            <div className="p-3"><EmptyState icon={ArrowLeftRight} title="لا توجد حوالات في هذا البحث" hint="غيّر كلمة البحث أو استعرض كل الحوالات من الإعداد «عرض كافة الحوالات تحت الصرف»." /></div>
          ) : (
            <div className="px-3 pb-3">
              <DataTable head={["رقم السند", "مبلغ الحوالة", "عملة الحوالة", "المستلم", "المرسل", "التاريخ", "الحالة"]}>
                {chooserHits.slice(0, 50).map((t) => (
                  <Tr key={t.id} className="cursor-pointer transition-colors hover:bg-primary/5" onClick={() => {
                    if (isPayable(t)) {
                      setChosen(t);
                      setChooseOpen(false);
                      setCardOpen(false);
                    } else {
                      toast.info("هذه الحوالة مُصروفة من قبل — تُعرض بطاقتها الآن.");
                      openCard(t);
                      setChooseOpen(false);
                    }
                  }}>
                    <Td money className="font-semibold text-primary">{documentNumber("incoming", t.document_number)}</Td>
                    <Td money className="font-bold">{fmt(t.amount)}</Td>
                    <Td>{t.currencies?.currency_name ?? ""}</Td>
                    <Td>{t.receiver_name}</Td>
                    <Td>{t.sender_name}</Td>
                    <Td money>{t.the_date}</Td>
                    <Td><StatusPill tone={t.delivered ? "ok" : "warn"}>{t.delivered ? "مسلّمة" : "معلقة"}</StatusPill></Td>
                  </Tr>
                ))}
              </DataTable>
            </div>
          )}
        </section>
      )}

      {chosen ? (
        <PayForm
          key={chosen.id}
          t={chosen}
          canDeliver={canDeliver}
          canCancel={canCancel}
          canWhatsapp={permissions.can("whatsapp")}
          defaultMethod={payMethodValue(setting("trf.default_pay_method"))}
          onCard={() => openCard(chosen)}
          onPrint={() => printVoucher(chosen)}
          onDelivered={(row) => {
            setChosen(null);
            void qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
            if (cardBeforePrint) openCard({ ...row, delivered: true });
          }}
        />
      ) : (
        <EmptyState
          icon={ArrowLeftRight}
          title="لا توجد حوالة محمّلة"
          hint="اضغط «إيجاد حوالة» لاختيار حوالة معلقة، أو اختر حوالة من قائمة المصروفة لعرض بطاقتها."
          action={<Button type="button" onClick={() => setChooseOpen(true)}>إيجاد حوالة</Button>}
        />
      )}

      <section className="mb-4 rounded-xl border border-border bg-card shadow-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-primary">
            <span className="h-3.5 w-1 rounded-full bg-gold" />
            الحوالات المصروفة
          </h2>
          <span className="ledger-figures rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{paidRows.length}</span>
        </header>
        <div className="grid gap-2 p-3">
          <Field label="بحث"><Input value={paidSearch} onChange={(e) => setPaidSearch(e.target.value)} placeholder="رقم السند أو اسم المستلم أو المرسل" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="من تاريخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="إلى تاريخ"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          </div>
        </div>
        {isLoading ? (
          <div className="p-3"><LoadingRows rows={3} /></div>
        ) : paidRows.length === 0 ? (
          <div className="p-3"><EmptyState icon={ArrowLeftRight} title="لا توجد حوالات مصروفة في هذا التاريخ" hint="غيّر مدى التاريخ أعلى القائمة، أو أصرف حوالة جديدة لتظهر هنا." /></div>
        ) : (
          <div className="px-3 pb-3">
            <DataTable head={["رقم السند", "التاريخ", "مبلغ الحوالة", "عملة الحوالة", "المستلم", "المرسل", "طريقة الصرف", "صُرف من", "ملاحظات"]}>
              {paidRows.map((t) => (
                <Tr key={t.id} className="cursor-pointer transition-colors hover:bg-primary/5" onClick={() => openCard(t)}>
                  <Td money className="font-semibold text-primary">{documentNumber("incoming", t.document_number)}</Td>
                  <Td money>{t.the_date}</Td>
                  <Td money className="font-bold">{fmt(t.amount)}</Td>
                  <Td>{t.currencies?.currency_name ?? ""}</Td>
                  <Td>{t.receiver_name}</Td>
                  <Td>{t.sender_name}</Td>
                  <Td>{methodName(t.payment_method)}</Td>
                  <Td>{t.payment_method === "account" ? t.customers?.full_name ?? "—" : t.boxes?.box_name ?? "—"}</Td>
                  <Td>{t.notes ?? ""}</Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        )}
      </section>

      {cardOpen && cardRow && (
        <ReceiverCardPanel
          t={cardRow}
          isManager={isManager}
          onClose={() => setCardOpen(false)}
          onPrint={() => navigate({ to: "/voucher/$kind/$id", params: { kind: "incoming", id: String(cardRow.id) } })}
        />
      )}
    </>
  );
}

/** نموذج الصرف: بيان الحوالة أعلى وحقول الصرف تحتها، ويُسلَّم بالحفظ كما في النظام القديم. */
function PayForm({
  t,
  canDeliver,
  canCancel,
  canWhatsapp,
  defaultMethod,
  onCard,
  onPrint,
  onDelivered,
}: {
  t: PayTransferRow;
  canDeliver: boolean;
  canCancel: boolean;
  canWhatsapp: boolean;
  defaultMethod: string;
  onCard: () => void;
  onPrint: () => void;
  onDelivered: (row: PayTransferRow) => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState(defaultMethod);
  const [box, setBox] = useState("");
  const [customer, setCustomer] = useState("");
  const [idNumber, setIdNumber] = useState(t.receiver_id_number?.trim() ?? "");

  const { data: customers = [] } = useQuery({
    queryKey: ["transfer-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, full_name, account_id").not("account_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const internal = t.internal_outgoing_id !== null;
  const notifyPhone = t.sender_phone;
  const notifyText = `حوالة واردة رقم ${documentNumber("incoming", t.document_number)} بمبلغ ${fmt(t.amount)} ${t.currencies?.currency_name ?? ""} — قيد المتابعة`;
  const notifyUrl = notifyPhone ? whatsAppLink(notifyPhone, notifyText) : null;

  const deliver = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("incoming_transfers")
        .update({
          delivered: true,
          payment_method: method,
          box_id: method === "cash" ? Number(box) : null,
          customer_id: method === "account" ? Number(customer) : null,
          receiver_id_number: idNumber.trim() || null,
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سُجّل التسليم وصُرف المبلغ");
      qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["totals"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      qc.invalidateQueries({ queryKey: ["statement"] });
      qc.invalidateQueries({ queryKey: ["all_accounts"] });
      onDelivered(t);
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const currencyName = t.currencies?.currency_name ?? "";
  const infoCell = (label: string, value: React.ReactNode, strong = false) => (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-2">
      <p className="text-[10.5px] font-semibold text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-sm ${strong ? "font-bold text-primary" : ""}`}>{value}</p>
    </div>
  );

  return (
    <FormCard
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (method === "cash" && !box) { toast.error("اختر صندوق الصرف"); return; }
        if (method === "account" && !customer) { toast.error("اختر حساب المستلم"); return; }
        deliver.mutate();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-primary">بيان الحوالة — {documentNumber("incoming", t.document_number)}</h2>
        <StatusPill tone="warn">معلقة</StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {infoCell("مبلغ الحوالة", <span className="ledger-figures">{fmt(t.amount)}</span>, true)}
        {infoCell("عملة الحوالة", currencyName)}
        {infoCell("المستلم", t.receiver_name, true)}
        {infoCell("المرسل", t.sender_name, true)}
        {infoCell("هاتف المستلم", <span className="ledger-figures">{t.receiver_phone || "—"}</span>)}
        {infoCell("هاتف المرسل", <span className="ledger-figures">{t.sender_phone || "—"}</span>)}
        {infoCell("رقم الحوالة", <span className="ledger-figures">{t.transfer_number ?? t.id}</span>)}
        {infoCell("الرقم المرجعي", <span className="ledger-figures">{t.reference_number ?? "—"}</span>)}
        {infoCell("تاريخ الحوالة", <span className="ledger-figures">{t.the_date}</span>)}
        {infoCell("الجهة / الوكيل", t.destination_name || t.agents?.agent_name || "—")}
      </div>
      {t.notes && <Notice tone="info">ملاحظات الحوالة: {t.notes}</Notice>}

      <fieldset className="grid gap-3 rounded-lg border border-border p-3 pt-2">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-bold text-primary">
          <span className="h-3 w-1 rounded-full bg-gold" />
          الصرف
        </legend>
        <Field label="طريقة الصرف">
          <select className={selectCls} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">نقد</option>
            <option value="account">حساب</option>
          </select>
        </Field>
        {method === "cash" ? (
          <BoxSelect required value={box} onChange={setBox} label="يُصرف من صندوق" />
        ) : (
          <Field label="حساب المستلم">
            <select required className={selectCls} value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">اختر العميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="مبلغ الصرف">
            <Input readOnly tabIndex={-1} value={fmt(t.amount)} className="ledger-figures bg-muted font-bold" />
          </Field>
          <Field label="رقم هوية المستلم">
            <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="ledger-figures" placeholder="اختياري" />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={onCard} className="rounded-lg bg-positive px-3 py-1 text-xs font-bold text-white">
          <IdCard className="size-4" /> بطاقة المستلم
        </Button>
        {canDeliver && (
          <Button type="submit" disabled={deliver.isPending} className="rounded-lg px-4">
            تأكيد التسليم وصرف المبلغ
          </Button>
        )}
        {canDeliver && canCancel && !internal && (
          <Button
            type="button"
            disabled={deliver.isPending}
            onClick={async () => {
              if (await confirmAsk("إلغاء الحوالة؟ يُرد المبلغ إن كان مقبوضًا فيه.")) {
                const { error } = await supabase.from("incoming_transfers").update({ canceled: true }).eq("id", t.id);
                if (error) { toast.error(boxErrorMessage(error)); return; }
                toast.success("أُلغيت الحوالة");
                qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
                onDelivered({ ...t, canceled: true, delivered: false });
              }
            }}
            variant="outline"
            className="rounded-lg border-destructive/40 px-3 py-1 text-xs font-medium text-destructive"
          >
            إلغاء
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onPrint} className="rounded-lg border-primary/40 px-3 py-1 text-xs font-medium text-primary">
          سند
        </Button>
        {notifyUrl && canWhatsapp && (
          <a href={notifyUrl} target="_blank" rel="noreferrer" aria-label="إشعار واتساب" className="rounded-lg border border-positive/40 px-3 py-1 text-xs font-medium text-positive">
            إشعار واتساب
          </a>
        )}
      </div>
      {internal && <Notice tone="info">حوالة داخلية: التسليم من هنا يُزامن قيد الحوالة الصادرة.</Notice>}
      <TransferEvidence direction="incoming" id={t.id} />
    </FormCard>
  );
}

/** بطاقة المستلم: البحث عن بطاقة مسجّلة واختيارها، وإضافة بطاقة للمدير والمشرف — كما في النظام القديم. */
function ReceiverCardPanel({
  t,
  isManager,
  onClose,
  onPrint,
}: {
  t: PayTransferRow;
  isManager: boolean;
  onClose: () => void;
  onPrint: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState(t.receiver_identity_number?.trim() || t.receiver_name.trim().split(/\s+/)[0] || "");
  const [selected, setSelected] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [g, setG] = useState({ full_name: t.receiver_name, phone_number: "", identity_type: "", identity_number: t.receiver_identity_number ?? "", country_id: "", notes: "" });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["receiver_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("receiver_cards").select("*, countries!country_id(country_name)").order("full_name").limit(200);
      if (error) throw error;
      return data as ReceiverCardRow[];
    },
  });

  const hits = cards.filter((c) => !q.trim() || `${c.full_name} ${c.identity_number ?? ""} ${c.phone_number ?? ""}`.includes(q.trim()));
  const current = hits.find((c) => c.id === selected) ?? (hits.length === 1 ? hits[0] : null);

  const addCard = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("receiver_cards")
        .insert({
          the_number: 0, // الترقيم يحدده قاعدة البيانات
          full_name: g.full_name.trim(),
          phone_number: g.phone_number.trim() || null,
          identity_type: g.identity_type.trim() || null,
          identity_number: g.identity_number.trim() || null,
          country_id: g.country_id ? Number(g.country_id) : null,
          notes: g.notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as number;
    },
    onSuccess: (id) => {
      toast.success("أُضيفت بطاقة المستلم");
      setSelected(id);
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["receiver_cards"] });
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("countries").select("id, country_name").eq("active", true).order("the_number");
      if (error) throw error;
      return data;
    },
  });

  return (
    <section className="mb-4 rounded-xl border border-positive/40 bg-card shadow-card">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-positive/10 px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-positive">
          <IdCard className="size-4" />
          بطاقة المستلم — {documentNumber("incoming", t.document_number)}
        </h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onPrint}>طباعة السند</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </header>
      <div className="grid gap-3 p-3">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/30 p-2 text-sm">
          <p>المستلم: <span className="font-bold">{t.receiver_name}</span></p>
          <p>الهاتف: <span className="ledger-figures">{t.receiver_phone || "—"}</span></p>
          <p>رقم الهوية في الحوالة: <span className="ledger-figures">{t.receiver_identity_number || "—"}</span></p>
          <p>المبلغ: <span className="ledger-figures font-bold">{fmtMoney(t.amount, t.currencies?.currency_name)}</span></p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1"><Field label="بحث في البطاقات"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو رقم الهوية أو الهاتف" /></Field></div>
          {isManager && <div className="self-end"><Button type="button" size="sm" variant="outline" onClick={() => setAddOpen((v) => !v)}>{addOpen ? "إلغاء الإضافة" : "إضافة بطاقة"}</Button></div>}
        </div>
        {!isManager && <Notice tone="info">إضافة وتعديل بطاقات المستلمين للمدير والمشرف فقط؛ يمكنك البحث والاختيار فقط.</Notice>}

        {isLoading ? (
          <LoadingRows rows={2} />
        ) : hits.length === 0 ? (
          <EmptyState icon={IdCard} title="لا توجد بطاقة مطابقة" hint={isManager ? "أضف بطاقة جديدة ببيانات المستلم." : "اطلب من المدير إضافة بطاقة لهذا المستلم."} />
        ) : (
          <DataTable head={["الاسم", "الهاتف", "نوع الهوية", "رقم الهوية", "الدولة", "ملاحظات"]}>
            {hits.slice(0, 20).map((c) => (
              <Tr key={c.id} className={`cursor-pointer transition-colors hover:bg-primary/5 ${current?.id === c.id ? "bg-positive/10" : ""}`} onClick={() => setSelected(c.id)}>
                <Td className="font-semibold">{c.full_name}</Td>
                <Td money>{c.phone_number ?? "—"}</Td>
                <Td>{c.identity_type ?? "—"}</Td>
                <Td money>{c.identity_number ?? "—"}</Td>
                <Td>{(c.countries as { country_name: string } | null)?.country_name ?? "—"}</Td>
                <Td>{c.notes ?? ""}</Td>
              </Tr>
            ))}
          </DataTable>
        )}

        {current && (
          <Notice tone="success">بطاقة مختارة: <span className="font-bold">{current.full_name}</span>{current.identity_number ? ` — هوية ${current.identity_number}` : ""}{current.phone_number ? ` — هاتف ${current.phone_number}` : ""}</Notice>
        )}

        {addOpen && isManager && (
          <FormCard
            className="mb-0 border-positive/40"
            onSubmit={(e) => { e.preventDefault(); if (!g.full_name.trim()) { toast.error("أدخل اسم المستلم"); return; } addCard.mutate(); }}
          >
            <p className="text-xs font-bold text-primary">بطاقة مستلم جديد</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="اسم المستلم"><Input required value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} /></Field>
              <Field label="الهاتف"><Input inputMode="tel" value={g.phone_number} onChange={(e) => setG({ ...g, phone_number: e.target.value })} className="ledger-figures" placeholder="07xxxxxxxx" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="نوع الهوية"><Input value={g.identity_type} onChange={(e) => setG({ ...g, identity_type: e.target.value })} placeholder="بطاقة شخصية / جواز" /></Field>
              <Field label="رقم الهوية"><Input value={g.identity_number} onChange={(e) => setG({ ...g, identity_number: e.target.value })} className="ledger-figures" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="الدولة">
                <select className={selectCls} value={g.country_id} onChange={(e) => setG({ ...g, country_id: e.target.value })}>
                  <option value="">بدون</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{(c as { country_name: string }).country_name}</option>)}
                </select>
              </Field>
              <Field label="ملاحظات"><Input value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></Field>
            </div>
            <Button type="submit" size="sm" disabled={addCard.isPending}>حفظ البطاقة</Button>
          </FormCard>
        )}
      </div>
    </section>
  );
}

type ReceiverCardRow = {
  id: number;
  full_name: string;
  phone_number: string | null;
  identity_type: string | null;
  identity_number: string | null;
  country_id: number | null;
  notes: string | null;
  countries: { country_name: string } | null;
};
