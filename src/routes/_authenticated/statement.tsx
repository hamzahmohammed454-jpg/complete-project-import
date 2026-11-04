import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";

import { BoxSelect, boxErrorMessage } from "@/components/box-select";
import { PendingNote, SectionIntro } from "@/components/section";
import { MenuStrip } from "@/components/menu-strip";
import { PaperFooter, PaperHeader, PaperWatermark } from "@/components/paper-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  Field,
  FormCard,
  LoadingRows,
  Notice,
  Segments,
  Td,
  Tr,
  selectCls,
} from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { fmt } from "@/lib/money";
import {
  filterBySide,
  partyNetBalances,
  totalsByCurrency,
  type AccountFilter,
} from "@/lib/all-accounts";
import {
  agentLines,
  customerTransferLines,
  balanceLabel,
  balanceSentence,
  checkLines,
  currencySummary,
  entryLines,
  voucherLines,
  withRunningBalance,
  type EntryDetailForStatement,
  type StatementLine,
} from "@/lib/statement";
import { waBalanceText, waDetailText, waLastOpText, waLinkOrPicker, waSummaryText } from "@/lib/whatsapp";
import { downloadBlob } from "@/lib/download";
import { allAccountsQuery } from "@/lib/all-accounts-query";
import { DebtFollowupReport } from "@/components/debt-followup-report";
import { StatementGroupPanel } from "@/components/statement-group-panel";
import { statementDirectoryQuery } from "@/lib/statement-directory-query";
import { accountsInStatementGroup, partiesInStatementGroup, type GroupAccount } from "@/lib/statement-groups";
import {
  allAccountsFilename,
  allAccountsToArrayBuffer,
  statementFilename,
  statementToArrayBuffer,
  summaryToArrayBuffer,
  xlsxBlob,
} from "@/lib/statement-xlsx";

type PartyType = "agent" | "customer" | "account";
type Search = { type: PartyType; id?: number | undefined; group?: number | undefined };

export const Route = createFileRoute("/_authenticated/statement")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    type: s["type"] === "account" ? "account" : s["type"] === "customer" ? "customer" : "agent",
    id: Number(s["id"]) > 0 ? Number(s["id"]) : undefined,
    group: Number.isSafeInteger(Number(s["group"])) && Number(s["group"]) > 0 ? Number(s["group"]) : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statementDirectoryQuery),
  head: () => ({ meta: [{ title: "كشف الحساب — ابو طه للصرافة" }, { name: "description", content: "كشف حساب العميل والوكيل بالحركات والأرصدة وحوالات الحساب خلال الفترة المحددة." }, { property: "og:title", content: "كشف الحساب — ابو طه للصرافة" }, { property: "og:description", content: "حركات وأرصدة العملاء والوكلاء مع تصدير كشف الفترة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: StatementScreen,
});

function StatementScreen() {
  const [mode, setMode] = useState<"single" | "all" | "weekly">("single");
  const directory = useSuspenseQuery(statementDirectoryQuery).data;
  const { group, type } = Route.useSearch();
  const navigate = useNavigate({ from: "/statement" });
  const groupId = group ?? null;
  const groupName = directory.groups.find((g) => g.id === groupId)?.group_name;
  return (
    <>
      <div className="print:hidden">
        <MenuStrip tab="/reports" />
        <SectionIntro title="كشف الحساب" subtitle="" />
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[13rem_minmax(0,1fr)] print:block">
        <StatementGroupPanel accounts={directory.accounts} groups={directory.groups} selected={groupId} onSelect={(id) => navigate({ search: { type: id === null ? type : "account", group: id ?? undefined } })} />
        <div className="min-w-0">
        <div className="mb-3 print:hidden">
          <h2 className="mb-2 text-sm font-semibold">{groupName ?? (groupId === null ? "كافة الحسابات" : "مجموعة غير موجودة")}</h2>
        <Segments
          ariaLabel="نطاق التقرير"
          options={[
            { value: "single", label: "حساب واحد" },
            { value: "all", label: "كافة الحسابات" },
            { value: "weekly", label: "متابعة أسبوعية" },
          ]}
          value={mode}
          onChange={(m) => setMode(m as "single" | "all" | "weekly")}
        />
        </div>
      {mode === "single" ? <SingleAccount accounts={directory.accounts} groupId={groupId} /> : mode === "all" ? <AllAccountsReport accounts={directory.accounts} groupId={groupId} groupName={groupName} /> : <Suspense fallback={<LoadingRows />}><DebtFollowupReport accounts={directory.accounts} groupId={groupId} groupName={groupName} /></Suspense>}
        </div>
      </div>
    </>
  );
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SingleAccount({ accounts, groupId }: { accounts: GroupAccount[]; groupId: number | null }) {
  const permissions = useScreenPermissions("/statement");
  const { type, id } = Route.useSearch();
  const navigate = useNavigate({ from: "/statement" });
  const { canRecordSettlements } = useAppRoles();
  const [reportType, setReportType] = useState<"detailed" | "summary">("detailed");
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [until, setUntil] = useState(adenDate());
  const [from, setFrom] = useState(""); // فارغ = من البداية
  const [docType, setDocType] = useState("all");
  const [showOpening, setShowOpening] = useState(true);
  const [showRunning, setShowRunning] = useState(true);
  const [settleOpen, setSettleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);

  const { data: parties = [] } = useQuery({
    queryKey: ["statement_parties", type],
    queryFn: async () => {
      if (type === "account") return [];
      if (type === "agent") {
        const { data, error } = await supabase.from("agents").select("id, the_number, agent_name, account_id, phone").order("the_number");
        if (error) throw error;
        return data.map((a) => ({ id: a.id, num: a.the_number, name: a.agent_name, account_id: a.account_id, phone: a.phone }));
      }
      const { data, error } = await supabase.from("customers").select("id, the_user_id, full_name, account_id, phone_number").order("full_name");
      if (error) throw error;
      return data.map((c) => ({ id: c.id, num: c.the_user_id, name: c.full_name, account_id: c.account_id, phone: c.phone_number }));
    },
  });
  const eligibleParties = type === "account"
    ? accountsInStatementGroup(accounts, groupId).map((a) => ({ id: a.id, num: a.account_number, name: a.account_name, account_id: a.id, phone: null }))
    : partiesInStatementGroup(parties, accounts, groupId);
  const party = eligibleParties.find((p) => p.id === id);
  const partyLabel = type === "account" ? "الحساب" : type === "agent" ? "الوكيل" : "العميل";

  const { data: accountOwner } = useQuery({
    queryKey: ["statement-account-owner", party?.account_id],
    enabled: type === "account" && Boolean(party),
    queryFn: async () => {
      if (!party) return null;
      const [customer, agent, box] = await Promise.all([
        supabase.from("customers").select("id").eq("account_id", party.account_id ?? 0).maybeSingle(),
        supabase.from("agents").select("id").eq("account_id", party.account_id ?? 0).maybeSingle(),
        supabase.from("boxes").select("id").eq("account_id", party.account_id ?? 0).maybeSingle(),
      ]);
      if (customer.error) throw customer.error;
      if (agent.error) throw agent.error;
      if (box.error) throw box.error;
      return { customer: customer.data?.id, agent: agent.data?.id, box: box.data?.id };
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
  const localId = currencies[0]?.id ?? 1;
  const { data: rates = new Map<number, number>() } = useQuery({
    queryKey: ["latest_rates", localId],
    queryFn: async () => {
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

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["statement", type, id, party?.account_id, accountOwner],
    enabled: Boolean(party) && (type !== "account" || accountOwner !== undefined),
    queryFn: async (): Promise<StatementLine[]> => {
      if (!party) return [];
      if (type === "account" && accountOwner?.box) {
        const { data, error } = await supabase.from("box_movements").select("id, amount, currency_id, movement_type, notes, created_at").eq("box_id", accountOwner.box).order("id");
        if (error) throw error;
        return data.map((m) => ({ date: new Date(m.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Aden" }), description: m.notes || `${m.movement_type} — ${m.id}`, debit: m.movement_type === "قبض" ? Number(m.amount) : 0, credit: m.movement_type === "صرف" ? Number(m.amount) : 0, currency_id: m.currency_id, sortKey: m.created_at }));
      }
      const entries = party.account_id ? await loadEntries(party.account_id) : [];
      if (type === "account" && !accountOwner?.customer && !accountOwner?.agent) return entryLines(entries);
      const ownerId = type === "account" ? accountOwner?.customer ?? accountOwner?.agent ?? party.id : party.id;
      if (type === "customer" || accountOwner?.customer) {
        const [v, c, movements] = await Promise.all([
          supabase
            .from("cash_vouchers")
            .select("id, the_number, voucher_type, amount, currency_id, the_date, cash_name, notes, created_at")
            .eq("customer_id", ownerId),
          supabase
            .from("checks")
            .select("id, the_number, check_type, check_number, amount, currency_id, status, the_date, collected_date, notes, created_at")
            .eq("customer_id", ownerId),
          supabase.from("customer_transfer_movements").select("*").eq("customer_id", ownerId),
        ]);
        if (v.error) throw v.error;
        if (c.error) throw c.error;
        if (movements.error) throw movements.error;
        return [...customerTransferLines(movements.data), ...entryLines(entries), ...voucherLines(v.data), ...checkLines(c.data)];
      }
      const [o, i, s] = await Promise.all([
        supabase.from("outgoing_transfers").select("id, transfer_number, amount, currency_id, the_date, canceled, receiver_name, created_at").eq("agent_id", ownerId),
        supabase.from("incoming_transfers").select("id, transfer_number, amount, currency_id, the_date, canceled, sender_name, created_at").eq("agent_id", ownerId),
        supabase.from("agent_settlements").select("id, amount, currency_id, direction, the_date, notes, created_at").eq("agent_id", ownerId),
      ]);
      if (o.error) throw o.error;
      if (i.error) throw i.error;
      if (s.error) throw s.error;
      return agentLines({
        outgoing: o.data.map((t) => ({ ...t, party: t.receiver_name })),
        incoming: i.data.map((t) => ({ ...t, party: t.sender_name })),
        settlements: s.data,
        entries,
      });
    },
  });

  const usedCurrencies = useMemo(() => {
    const ids = new Set(lines.map((l) => l.currency_id));
    return currencies.filter((c) => ids.has(c.id));
  }, [lines, currencies]);
  const typedLines = useMemo(() => (docType === "all" ? lines : lines.filter((l) => l.kind === docType)), [lines, docType]);
  const untilLines = useMemo(() => typedLines.filter((l) => l.date <= until), [typedLines, until]);
  // التقرير التفصيلي يحتاج عملة محددة؛ إن لم تُختر نأخذ أول عملة مستخدمة
  const activeCurrency = reportType === "summary" ? null : (currencyId ?? usedCurrencies[0]?.id ?? null);
  const sheet = withRunningBalance(untilLines, activeCurrency);
  // رصيد سابق: مجموع ما قبل تاريخ «من يوم»، وتُعرض الحركات من ذلك اليوم فقط
  const opening = from ? sheet.rows.filter((r) => r.date < from).reduce((s, r) => s + r.debit - r.credit, 0) : 0;
  const shownRows = from ? sheet.rows.filter((r) => r.date >= from) : sheet.rows;
  const q = search.trim();
  const searched = q ? shownRows.filter((r) => `${r.description} ${r.debit} ${r.credit} ${r.date}`.includes(q)) : shownRows;
  const displayRows = newestFirst ? [...searched].reverse() : searched;
  const summary = currencySummary(lines, until, rates, localId);
  const nameOf = (cid: number | null) => currencies.find((c) => c.id === cid)?.currency_name ?? "";
  const printedAt = new Date().toLocaleString("en-GB", { hour12: true });
  const curName = activeCurrency == null ? "كل العملات" : nameOf(activeCurrency);
  const localName = nameOf(localId);

  // رسائل واتساب الجاهزة للعميل: الرصيد، كشف إجمالي، كشف تفصيلي، وآخر عملية
  const waButtons = !party
    ? []
    : [
        { label: "الرصيد", text: waBalanceText(party.name, balanceSentence(sheet.balance, curName), until) },
        {
          label: "كشف إجمالي",
          text: waSummaryText(
            party.name,
            until,
            summary.rows.map((r) => ({ currency: nameOf(r.currency_id), debit: r.debit, credit: r.credit })),
            balanceSentence(summary.net, localName),
          ),
        },
        { label: "كشف تفصيلي", text: waDetailText(party.name, from, until, shownRows, balanceSentence(sheet.balance, curName)) },
        { label: "آخر عملية", text: waLastOpText(party.name, shownRows.at(-1) ?? null) },
      ];

  // تنزيل الكشف بصيغة Excel: تفصيلي لعملة محددة، أو إجمالي لكل العملات
  const exportExcel = () => {
    if (!party) return;
    const period = from ? `من ${from} حتى ${until}` : `حتى ${until}`;
    const label = `كشف حساب ${partyLabel}: ${party.name}`;
    const buf = activeCurrency == null
      ? summaryToArrayBuffer({
          partyLabel: label,
          partyNumber: party.num || null,
          period,
          localName,
          rows: summary.rows.map((r) => ({
            currency: nameOf(r.currency_id),
            debit: r.debit,
            credit: r.credit,
            equivDebit: r.equivDebit,
            equivCredit: r.equivCredit,
            balanceText: balanceSentence(r.balance, nameOf(r.currency_id)),
          })),
          totalEquivDebit: summary.equivDebit,
          totalEquivCredit: summary.equivCredit,
          balanceSentence: balanceSentence(summary.net, localName),
        })
      : statementToArrayBuffer({
          partyLabel: label,
          partyNumber: party.num || null,
          period,
          currencyName: curName,
          opening: from && showOpening ? opening : null,
          rows: shownRows,
          totalDebit: sheet.debit,
          totalCredit: sheet.credit,
          balanceSentence: balanceSentence(sheet.balance, curName),
        });
    downloadBlob(xlsxBlob(buf), statementFilename(party.name, until));
    toast.success("نُزّل ملف Excel");
  };

  return (
    <>
      <div className="print:hidden">
        <Segments
          ariaLabel="نوع الطرف"
          options={[{ value: "account", label: "الحسابات" }, { value: "agent", label: "وكيل" }, { value: "customer", label: "عميل" }]}
          value={type}
          onChange={(t) => { setCurrencyId(null); navigate({ search: { type: t, group: groupId ?? undefined } }); }}
        />
        <Field label={partyLabel} className="mb-4">
          <select
            className={selectCls}
            value={id ?? ""}
            onChange={(e) => { setCurrencyId(null); navigate({ search: { type, group: groupId ?? undefined, id: e.target.value ? Number(e.target.value) : undefined } }); }}
          >
            <option value="">اختر {partyLabel}</option>
            {eligibleParties.map((p) => (
              <option key={p.id} value={p.id}>{p.num ? `${p.num} — ` : ""}{p.name}</option>
            ))}
          </select>
        </Field>
      </div>

      {!party ? (
        <PendingNote text={eligibleParties.length === 0 ? "لا توجد حسابات مطابقة للمجموعة ونوع الحساب المختار." : "اختر الحساب لعرض كشفه."} />
      ) : (
        <>
          {type === "agent" && canRecordSettlements && (
            <div className="mb-3 print:hidden">
              <Button variant="outline" className="w-full" onClick={() => setSettleOpen((v) => !v)}>
                {settleOpen ? "إغلاق" : "تسوية مع الوكيل"}
              </Button>
              {settleOpen && <SettlementForm agentId={party.id} currencies={currencies} onDone={() => setSettleOpen(false)} />}
            </div>
          )}

          <div className="mb-3 grid grid-cols-2 gap-2 print:hidden">
            <Field label="بحث داخل التقرير">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="البيان أو المبلغ" />
            </Field>
            <Field label="الترتيب حسب وقت الإدخال">
              <select className={selectCls} value={newestFirst ? "new" : "old"} onChange={(e) => setNewestFirst(e.target.value === "new")}>
                <option value="old">الأقدم أولاً</option>
                <option value="new">الأحدث أولاً</option>
              </select>
            </Field>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 print:hidden">
            <Field label="نوع التقرير">
              <select
                className={selectCls}
                value={reportType}
                onChange={(e) => setReportType(e.target.value as "detailed" | "summary")}
              >
                <option value="detailed">تقرير تفصيلي</option>
                <option value="summary">تقرير إجمالي</option>
              </select>
            </Field>
            {reportType === "detailed" ? (
              <Field label="العملة">
                <select
                  className={selectCls}
                  value={activeCurrency ?? ""}
                  onChange={(e) => setCurrencyId(e.target.value ? Number(e.target.value) : null)}
                >
                  {usedCurrencies.length === 0 && <option value="">لا عملات مستخدمة</option>}
                  {usedCurrencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.currency_name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="نوع المستند">
                <select className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="all">كل المستندات</option>
                  <option value="transfer">الحوالات</option>
                  <option value="voucher">السندات</option>
                  <option value="check">الشيكات</option>
                  <option value="entry">القيود</option>
                  <option value="settlement">التسويات</option>
                </select>
              </Field>
            )}
          </div>
          {reportType === "detailed" && (
            <Field label="نوع المستند" className="mb-3 print:hidden">
              <select className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="all">كل المستندات</option>
                <option value="transfer">الحوالات</option>
                <option value="voucher">السندات</option>
                <option value="check">الشيكات</option>
                <option value="entry">القيود</option>
                <option value="settlement">التسويات</option>
              </select>
            </Field>
          )}

          <div className="mb-3 grid grid-cols-2 gap-2 print:hidden">
            <Field label="من يوم">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" />
            </Field>
            <Field label="حتى يوم">
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value || adenDate())} className="ledger-figures" />
            </Field>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 print:hidden">
            <CheckOption label="مع رصيد سابق" checked={showOpening} onChange={setShowOpening} />
            {reportType === "detailed" && <CheckOption label="مع رصيد تفصيلي" checked={showRunning} onChange={setShowRunning} />}
          </div>

          <div className="voucher printable voucher-paper relative overflow-hidden bg-paper p-2 sm:p-4">
            <PaperWatermark />
            <PaperHeader />
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
            <p className="display font-bold">كشف حساب {partyLabel}: {party.name}</p>
                <p className="text-xs text-muted-foreground">
                  {reportType === "summary" ? "تقرير إجمالي · كل العملات" : <>العملة: {curName || "—"}</>} · الفترة: <span className="ledger-figures">{from || "من البداية"}</span> حتى <span className="ledger-figures">{until}</span>
                  {party.num ? <> · الرقم: <span className="ledger-figures">{party.num}</span></> : null}
                </p>
              </div>
              <div className="flex shrink-0 gap-1 print:hidden">
                <button type="button" disabled={!permissions.can("print") || !permissions.can("excel")} onClick={exportExcel} aria-label="تنزيل Excel" title="تنزيل الكشف بصيغة Excel" className="rounded-lg border border-border p-2 text-muted-foreground">
                  <FileSpreadsheet className="size-4" />
                </button>
                <button type="button" disabled={!permissions.can("print") || !permissions.can("pdf")} onClick={() => window.print()} aria-label="حفظ PDF" title="حفظ PDF — اختر «حفظ بتنسيق PDF» من نافذة الطباعة" className="rounded-lg border border-border p-2 text-muted-foreground">
                  <FileDown className="size-4" />
                </button>
                <button type="button" disabled={!permissions.can("print")} onClick={() => window.print()} aria-label="طباعة الكشف" className="rounded-lg border border-border p-2 text-muted-foreground">
                  <Printer className="size-4" />
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
              {waButtons.map((b) => (
                <a
                  key={b.label}
                  href={waLinkOrPicker(party.phone, b.text)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`إرسال ${b.label} واتساب`}
                  className="rounded-lg border border-positive/40 px-2 py-1.5 text-xs font-medium text-positive"
                >
                  واتساب: {b.label}
                </a>
              ))}
            </div>

            {isLoading ? (
              <LoadingRows rows={3} />
            ) : activeCurrency == null ? (
              <SummaryTable summary={summary} nameOf={nameOf} localName={localName} />
            ) : shownRows.length === 0 ? (
              <Notice tone="info">لا حركات بهذه العملة في هذه الفترة.</Notice>
            ) : (
              <>
                <div className="statement-compact"><DataTable head={showRunning ? ["البيان", "مدين", "دائن", "الرصيد"] : ["البيان", "مدين", "دائن"]}>
                  {from && showOpening && (
                    <Tr className="bg-paper font-medium">
                      <Td>رصيد سابق</Td>
                      <Td money align="end">{fmt(0)}</Td>
                      <Td money align="end">{fmt(0)}</Td>
                      {showRunning && (
                        <Td money align="end">
                          {fmt(Math.abs(opening))}<span className="block text-[10px] font-normal text-muted-foreground">{balanceLabel(opening)}</span>
                        </Td>
                      )}
                    </Tr>
                  )}
                  {displayRows.map((r, idx) => (
                    <Tr key={idx}>
                      <Td className="statement-desc">
                        <p className="line-clamp-2 break-words leading-snug">{r.description}</p>
                        <p className="ledger-figures text-[10px] text-muted-foreground">{r.date}</p>
                      </Td>
                      <Td money align="end">{r.debit ? fmt(r.debit) : ""}</Td>
                      <Td money align="end">{r.credit ? fmt(r.credit) : ""}</Td>
                      {showRunning && (
                        <Td money align="end" className="font-medium">
                          {fmt(Math.abs(r.balance))}<span className="block text-[10px] font-normal text-muted-foreground">{balanceLabel(r.balance)}</span>
                        </Td>
                      )}
                    </Tr>
                  ))}
                  <Tr className="font-semibold">
                    <Td>الإجمالي</Td>
                    <Td money align="end">{fmt(sheet.debit)}</Td>
                    <Td money align="end">{fmt(sheet.credit)}</Td>
                    {showRunning && <Td />}
                  </Tr>
                </DataTable></div>
                <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold leading-relaxed text-primary">
                  {balanceSentence(sheet.balance, curName)}
                </p>
              </>
            )}
            <PaperFooter
              qrValue={`كشف حساب ${type === "agent" ? "الوكيل" : "العميل"} | ${party.name} | ${from || "من البداية"} حتى ${until}`}
              printedAt={printedAt}
            />
          </div>
        </>
      )}
    </>
  );
}

const SIDE_OPTIONS: { value: AccountFilter; label: string }[] = [
  { value: "all", label: "الدائنون والمدينون" },
  { value: "debtors", label: "المدينون" },
  { value: "creditors", label: "الدائنون" },
];

function AllAccountsReport({ accounts, groupId, groupName }: { accounts: GroupAccount[]; groupId: number | null; groupName?: string | undefined }) {
  const permissions = useScreenPermissions("/statement");
  const [kind, setKind] = useState<"all" | "customer" | "agent">("all");
  const [side, setSide] = useState<AccountFilter>("all");
  const [currencyId, setCurrencyId] = useState<number | null>(null); // null = كافة العملات
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState(adenDate());

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data;
    },
  });
  const nameOf = (cid: number | null) => currencies.find((c) => c.id === cid)?.currency_name ?? "";

  const { data, isLoading, error: loadError } = useQuery(allAccountsQuery);

  const rows = useMemo(() => {
    if (!data) return [];
    const scopedData = { ...data, customers: partiesInStatementGroup(data.customers, accounts, groupId), agents: partiesInStatementGroup(data.agents, accounts, groupId) };
    let r = filterBySide(partyNetBalances(scopedData, from, until), side);
    if (kind !== "all") r = r.filter((x) => x.kind === kind);
    if (currencyId != null) r = r.filter((x) => x.currency_id === currencyId);
    return r;
  }, [data, from, until, side, kind, currencyId, accounts, groupId]);
  const totals = useMemo(() => [...totalsByCurrency(rows).entries()].map(([cid, t]) => ({ currency: nameOf(cid), ...t })), [rows, currencies]); // eslint-disable-line react-hooks/exhaustive-deps

  const period = from ? `من ${from} حتى ${until}` : `حتى ${until}`;
  const printedAt = new Date().toLocaleString("en-GB", { hour12: true });
  const sideLabel = SIDE_OPTIONS.find((o) => o.value === side)?.label ?? "";

  const exportExcel = () => {
    const buf = allAccountsToArrayBuffer({
      period,
      filterLabel: [groupName, sideLabel].filter(Boolean).join(" · "),
      rows: rows.map((r) => ({
        name: r.name,
        kindLabel: r.kind === "agent" ? "وكيل" : "عميل",
        num: r.num,
        currency: nameOf(r.currency_id),
        debit: r.net > 0 ? r.net : 0,
        credit: r.net < 0 ? -r.net : 0,
      })),
      totals,
    });
    downloadBlob(xlsxBlob(buf), allAccountsFilename(until));
    toast.success("نُزّل ملف Excel");
  };

  return (
    <>
      <div className="print:hidden">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="الحسابات">
            <select className={selectCls} value={side} onChange={(e) => setSide(e.target.value as AccountFilter)}>
              {SIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="العملة">
            <select className={selectCls} value={currencyId ?? ""} onChange={(e) => setCurrencyId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">كافة العملات</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>{c.currency_name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="من يوم">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ledger-figures" />
          </Field>
          <Field label="حتى يوم">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value || adenDate())} className="ledger-figures" />
          </Field>
        </div>
        <Segments
          ariaLabel="نوع الأطراف"
          options={[
            { value: "all", label: "الكل" },
            { value: "customer", label: "العملاء" },
            { value: "agent", label: "الوكلاء" },
          ]}
          value={kind}
          onChange={(k) => setKind(k as "all" | "customer" | "agent")}
        />
      </div>

      <div className="voucher printable voucher-paper relative overflow-hidden bg-paper p-2 sm:p-4">
        <PaperWatermark />
        <PaperHeader />
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="display font-bold">تقرير حسابات العملاء والوكلاء{groupName ? ` — ${groupName}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              {sideLabel} · العملة: {currencyId == null ? "كافة العملات" : nameOf(currencyId)} · الفترة: <span className="ledger-figures">{period}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-1 print:hidden">
            <button type="button" disabled={!permissions.can("print") || !permissions.can("excel")} onClick={exportExcel} aria-label="تنزيل Excel" title="تنزيل التقرير بصيغة Excel" className="rounded-lg border border-border p-2 text-muted-foreground">
              <FileSpreadsheet className="size-4" />
            </button>
            <button type="button" disabled={!permissions.can("print") || !permissions.can("pdf")} onClick={() => window.print()} aria-label="حفظ PDF" title="حفظ PDF — اختر «حفظ بتنسيق PDF» من نافذة الطباعة" className="rounded-lg border border-border p-2 text-muted-foreground">
              <FileDown className="size-4" />
            </button>
            <button type="button" disabled={!permissions.can("print")} onClick={() => window.print()} aria-label="طباعة التقرير" className="rounded-lg border border-border p-2 text-muted-foreground">
              <Printer className="size-4" />
            </button>
          </div>
        </div>

        {loadError ? <Notice tone="danger">تعذّر تحميل جميع الحركات؛ لا يمكن عرض رصيد ناقص.</Notice> : isLoading ? (
          <LoadingRows rows={3} />
        ) : rows.length === 0 ? (
          <Notice tone="info">لا أرصدة مطابقة لهذه الخيارات في هذه الفترة.</Notice>
        ) : (
          <div className="statement-compact"><DataTable head={["الاسم", "النوع", "العملة", "مدين (لنا)", "دائن (لهم)"]}>
            {rows.map((r) => (
              <Tr key={`${r.kind}-${r.id}-${r.currency_id}`}>
                <Td className="statement-desc">
                  <p className="line-clamp-2 break-words font-medium leading-snug">{r.name}</p>
                  {r.num != null && <p className="ledger-figures text-[10px] text-muted-foreground">{r.num}</p>}
                </Td>
                <Td>{r.kind === "agent" ? "وكيل" : "عميل"}</Td>
                <Td>{nameOf(r.currency_id)}</Td>
                <Td money align="end" className={r.net > 0 ? "font-semibold text-positive" : ""}>
                  {r.net > 0 ? fmt(r.net) : fmt(0)}
                </Td>
                <Td money align="end" className={r.net < 0 ? "font-semibold text-destructive" : ""}>
                  {r.net < 0 ? fmt(-r.net) : fmt(0)}
                </Td>
              </Tr>
            ))}
            {totals.map((t) => (
              <Tr key={t.currency} className="font-semibold">
                <Td colSpan={3}>إجمالي {t.currency}</Td>
                <Td money align="end">{fmt(t.debit)}</Td>
                <Td money align="end">{fmt(t.credit)}</Td>
              </Tr>
            ))}
          </DataTable></div>
        )}
        <PaperFooter
          qrValue={`تقرير كافة الحسابات | ${period}`}
          printedAt={printedAt}
        />
      </div>
    </>
  );
}

function SummaryTable({
  summary, nameOf, localName,
}: {
  summary: ReturnType<typeof currencySummary>;
  nameOf: (id: number) => string;
  localName: string;
}) {
  if (summary.rows.length === 0) return <Notice tone="info">لا حركات على هذا الحساب حتى هذا اليوم.</Notice>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th rowSpan={2} className="py-1 text-start font-medium">العملة</th>
              <th colSpan={2} className="py-1 text-center font-medium">المبلغ</th>
              <th colSpan={2} className="py-1 text-center font-medium">المقابل ({localName})</th>
            </tr>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1 text-end font-medium">مدين</th>
              <th className="py-1 text-end font-medium">دائن</th>
              <th className="py-1 text-end font-medium">مدين</th>
              <th className="py-1 text-end font-medium">دائن</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.currency_id} className="border-b border-border/60 align-top">
                <td className="py-1.5 pe-2 font-medium">
                  {nameOf(r.currency_id)}
                  <p className="mt-0.5 text-[10px] font-normal leading-snug text-muted-foreground">{balanceSentence(r.balance, nameOf(r.currency_id))}</p>
                </td>
                <td className="ledger-figures py-1.5 text-end">{fmt(r.debit)}</td>
                <td className="ledger-figures py-1.5 text-end">{fmt(r.credit)}</td>
                <td className="ledger-figures py-1.5 text-end">{fmt(r.equivDebit)}</td>
                <td className="ledger-figures py-1.5 text-end">{fmt(r.equivCredit)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-2 pe-2" colSpan={3}>الإجمالي</td>
              <td className="ledger-figures pt-2 text-end">{fmt(summary.equivDebit)}</td>
              <td className="ledger-figures pt-2 text-end">{fmt(summary.equivCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold leading-relaxed text-primary">
        {balanceSentence(summary.net, localName)}
      </p>
      {summary.missingRate && (
        <Notice tone="warn" className="mt-2">بعض العملات بلا سعر صرف اليوم، فمقابلها محسوب صفرًا. أدخل الأسعار من شاشة العملات والأسعار.</Notice>
      )}
    </>
  );
}

async function loadEntries(accountId: number): Promise<EntryDetailForStatement[]> {
  const { data, error } = await supabase
    .from("entries_details")
    .select("side, amount, currency_id, notes, entries!inner(entry_number, the_date, notes, created_at)")
    .eq("account_id", accountId)
    .eq("settlement_mirror", false);
  if (error) throw error;
  return data.map((d) => {
    const e = d.entries as unknown as { entry_number: number; the_date: string; notes: string | null; created_at: string };
    return {
      side: d.side, amount: d.amount, currency_id: d.currency_id, notes: d.notes,
      entry_number: e.entry_number, the_date: e.the_date, entry_notes: e.notes, created_at: e.created_at,
    };
  });
}

function SettlementForm({ agentId, currencies, onDone }: { agentId: number; currencies: { id: number; currency_name: string }[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ direction: "paid_to_agent", currency_id: "", amount: "", box_id: "", notes: "" });
  const setBox = (v: string) => setF((p) => ({ ...p, box_id: v }));
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_settlements").insert({
        agent_id: agentId,
        direction: f.direction,
        currency_id: Number(f.currency_id),
        amount: Number(f.amount),
        box_id: f.box_id ? Number(f.box_id) : null,
        notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سُجّلت التسوية");
      qc.invalidateQueries({ queryKey: ["statement"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      onDone();
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });
  return (
    <FormCard className="mt-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="اتجاه التسوية">
        <select className={selectCls} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
          <option value="paid_to_agent">دفعنا للوكيل (صرف من الصندوق)</option>
          <option value="received_from_agent">استلمنا من الوكيل (قبض في الصندوق)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input required inputMode="decimal" placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="ledger-figures" />
        </Field>
        <Field label="العملة">
          <select required className={selectCls} value={f.currency_id} onChange={(e) => setF({ ...f, currency_id: e.target.value })}>
            <option value="">اختر العملة</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
      </div>
      <BoxSelect value={f.box_id} onChange={setBox} />
      <Field label="البيان">
        <Input placeholder="وصف التسوية" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <Button type="submit" disabled={m.isPending}>حفظ التسوية</Button>
    </FormCard>
  );
}
