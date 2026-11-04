import { amountInWords } from "@/lib/tafteesh";
import { documentNumber } from "@/lib/document-number";

export type VoucherKind = "outgoing" | "incoming" | "buy" | "sell" | "receipt" | "payment" | "deposit" | "journal";

export const VOUCHER_KINDS: readonly VoucherKind[] = ["outgoing", "incoming", "buy", "sell", "receipt", "payment", "deposit", "journal"];

export const VOUCHER_TITLES: Record<VoucherKind, string> = {
  outgoing: "سند حوالة صادرة",
  incoming: "سند حوالة واردة",
  buy: "سند شراء عملة",
  sell: "سند بيع عملة",
  receipt: "سند قبض",
  payment: "سند صرف",
  deposit: "سند إيداع نقدي",
  journal: "سند قيد بسيط",
};

/** عملية من حساب العميل تُطبع إشعار مدين أو دائن؛ العملية النقدية تُطبع بسندها الخاص. */
const ACCOUNT_NOTICE: Partial<Record<VoucherKind, string>> = {
  outgoing: "إشعار مدين",
  sell: "إشعار مدين",
  payment: "إشعار مدين",
  incoming: "إشعار دائن",
  buy: "إشعار دائن",
  receipt: "إشعار دائن",
};

export function voucherTitle(kind: VoucherKind, viaAccount: boolean): string {
  return (viaAccount && ACCOUNT_NOTICE[kind]) || VOUCHER_TITLES[kind];
}

export interface VoucherRow {
  label: string;
  value: string;
}

export interface VoucherModel {
  kind: VoucherKind;
  title: string;
  number: string;
  date: string;
  rows: VoucherRow[];
  amountWords: string;
  staff: string;
  /** المبلغ بالأرقام بصيغة #200# كما في السندات الورقية */
  amountFigure?: string;
  currency?: string;
}

export interface TransferRow {
  document_number?: number | null;
  id: number;
  transfer_number: number | null;
  amount: number | string;
  the_date: string;
  sender_name: string;
  sender_phone: string | null;
  receiver_name: string;
  receiver_phone: string | null;
  state: string | null;
  delivered: boolean;
  canceled: boolean;
  branch_commission: number | string | null;
  notes: string | null;
  currency_name: string | null;
  commission_currency_name: string | null;
  agent_name: string | null;
  payment_method?: string;
  customer_name?: string | null;
  reference_number?: string | null;
}

export interface ExchangeRow {
  document_number?: number | null;
  id: number;
  the_number: number | null;
  amount: number | string;
  price: number | string;
  exchange_amount: number | string | null;
  commission?: number | string | null;
  the_date: string;
  cash_customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  currency_name: string | null;
  exchange_currency_name: string | null;
  account_id?: number | null;
}

const figures = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** أرقام لاتية مفصولة بفواصل: أوضح في السند المطبوع وفي نص الواتساب. */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? figures.format(n) : "0";
}

export function transferState(row: Pick<TransferRow, "state" | "delivered" | "canceled">): string {
  if (row.canceled) return "ملغاة";
  if (row.delivered) return "مسلّمة";
  return row.state ?? "معلقة";
}

export function buildTransferVoucher(kind: "outgoing" | "incoming", row: TransferRow, staff: string): VoucherModel {
  const amount = Number(row.amount);
  const currency = row.currency_name ?? "";
  const rows: VoucherRow[] = [
    { label: "المرسل", value: row.sender_name },
    { label: "هاتف المرسل", value: row.sender_phone ?? "" },
    { label: "المستلم", value: row.receiver_name },
    { label: "هاتف المستلم", value: row.receiver_phone ?? "" },
    { label: "الوكيل", value: row.agent_name ?? "—" },
    { label: "العملة", value: currency },
    { label: "المبلغ", value: `${money(amount)} ${currency}` },
    {
      label: "العمولة",
      value: `${money(row.branch_commission)} ${row.commission_currency_name ?? currency}`,
    },
    ...(row.payment_method === "account" ? [{ label: "الحساب", value: row.customer_name ?? "—" }] : []),
    { label: "المرجع", value: row.reference_number ?? "—" },
    { label: "الحالة", value: transferState(row) },
  ];
  if (row.notes) rows.push({ label: "ملاحظات", value: row.notes });
  return {
    kind,
    title: voucherTitle(kind, row.payment_method === "account"),
    number: row.document_number != null ? documentNumber(kind, row.document_number) : String(row.transfer_number ?? row.id),
    date: row.the_date,
    rows,
    amountWords: amountInWords(amount, currency),
    staff,
    amountFigure: `#${money(amount)}#`,
    currency,
  };
}

export function buildExchangeVoucher(kind: "buy" | "sell", row: ExchangeRow, staff: string): VoucherModel {
  const amount = Number(row.amount);
  const currency = row.currency_name ?? "";
  const rows: VoucherRow[] = [
    { label: "الزبون", value: row.cash_customer_name || "زبون نقدي" },
    { label: "هاتف الزبون", value: row.customer_phone ?? "" },
    { label: "العملة", value: currency },
    { label: "المبلغ", value: `${money(amount)} ${currency}` },
    { label: "السعر", value: money(row.price) },
    {
      label: "الإجمالي",
      value: `${money(row.exchange_amount)} ${row.exchange_currency_name ?? ""}`.trim(),
    },
  ];
  if (Number(row.commission ?? 0) > 0) {
    rows.push({ label: "العمولة", value: `${money(row.commission)} ${row.exchange_currency_name ?? ""}`.trim() });
  }
  if (row.notes) rows.push({ label: "ملاحظات", value: row.notes });
  return {
    kind,
    title: voucherTitle(kind, row.account_id != null),
    number: row.document_number != null ? documentNumber(kind, row.document_number) : String(row.the_number ?? row.id),
    date: row.the_date,
    rows,
    amountWords: amountInWords(amount, currency),
    staff,
    amountFigure: `#${money(amount)}#`,
    currency,
  };
}

export interface CashVoucherRow {
  document_number?: number | null;
  id: number;
  the_number: number | null;
  voucher_type: string;
  amount: number | string;
  the_date: string;
  cash_name: string | null;
  notes: string | null;
  customer_name: string | null;
  currency_name: string | null;
  box_name: string | null;
  amounts?: { amount: number | string; currency_name: string | null }[];
}

export function buildCashVoucher(kind: "receipt" | "payment" | "deposit", row: CashVoucherRow, staff: string): VoucherModel {
  const amount = Number(row.amount);
  const currency = row.currency_name ?? "";
  const party = row.customer_name ?? row.cash_name ?? "نقدي";
  const rows: VoucherRow[] = [
    { label: kind === "payment" ? "استلم منا" : "استلمنا من", value: party },
    { label: "العملة", value: currency },
    { label: "المبلغ", value: `${money(amount)} ${currency}` },
    { label: "الصندوق", value: row.box_name ?? "—" },
  ];
  if (row.notes) rows.push({ label: "البيان", value: row.notes });
  const amounts = row.amounts && row.amounts.length > 1 ? row.amounts : null;
  if (amounts) {
    rows.splice(1, 2, ...amounts.map((line, index) => ({ label: `المبلغ ${index + 1}`, value: `${money(line.amount)} ${line.currency_name ?? ""}`.trim() })));
  }
  return {
    kind,
    title: VOUCHER_TITLES[kind],
    number: row.document_number != null ? documentNumber(kind, row.document_number) : String(row.the_number ?? row.id),
    date: row.the_date,
    rows,
    amountWords: amounts ? amounts.map((line) => amountInWords(Number(line.amount), line.currency_name ?? "")).join("؛ ") : amountInWords(amount, currency),
    staff,
    amountFigure: amounts ? "" : `#${money(amount)}#`,
    currency: amounts ? "عدة عملات" : currency,
  };
}

export interface JournalVoucherRow {
  document_number?: number | null;
  id: number;
  the_number: number | null;
  the_date: string;
  amount: number | string;
  notes: string | null;
  debit_account: string | null;
  credit_account: string | null;
  currency_name: string | null;
}

export function buildJournalVoucher(row: JournalVoucherRow, staff: string): VoucherModel {
  const amount = Number(row.amount);
  const currency = row.currency_name ?? "";
  const rows: VoucherRow[] = [
    { label: "الحساب المدين", value: row.debit_account ?? "—" },
    { label: "الحساب الدائن", value: row.credit_account ?? "—" },
    { label: "العملة", value: currency },
    { label: "المبلغ", value: `${money(amount)} ${currency}` },
  ];
  if (row.notes) rows.push({ label: "البيان", value: row.notes });
  return {
    kind: "journal",
    title: VOUCHER_TITLES.journal,
    number: row.document_number != null ? documentNumber("journal", row.document_number) : String(row.the_number ?? row.id),
    date: row.the_date,
    rows,
    amountWords: amountInWords(amount, currency),
    staff,
    amountFigure: `#${money(amount)}#`,
    currency,
  };
}

/** نص السند للمشاركة عبر واتساب أو مشاركة الجوال. */
export function voucherToText(model: VoucherModel): string {
  const lines = [model.title, `رقم: ${model.number}`, `التاريخ: ${model.date}`];
  for (const row of model.rows) if (row.value) lines.push(`${row.label}: ${row.value}`);
  lines.push(model.amountWords);
  if (model.staff) lines.push(`الموظف: ${model.staff}`);
  lines.push("ابو طه للصرافة");
  return lines.join("\n");
}

/** إشعار مدين/دائن لعميل يُعرض بدل السند حين تمر العملية على حسابه. */
export interface AccountNotice {
  side: "debit" | "credit";
  title: string;
  number: string;
  date: string;
  party: string;
  accountNumber: string;
  currency: string;
  amount: number;
  amountWords: string;
  /** خدمات/عمولة تُضاف على المبلغ في إشعار المدين */
  fee?: number | undefined;
  narrative: string[];
  staff: string;
  phone?: string | null;
}

export function transferNotice(kind: "outgoing" | "incoming", row: TransferRow, account: { name: string; number: string; phone?: string | null }, staff: string): AccountNotice {
  const amount = Number(row.amount);
  const currency = row.currency_name ?? "";
  const fee = kind === "outgoing" ? Number(row.branch_commission ?? 0) : 0;
  const total = amount + fee;
  const narrative = kind === "incoming"
    ? [
        `مقابل حوالة واردة عن طريق ${row.agent_name ?? "—"} بتاريخ ${row.the_date}`,
        `مبلغ الحوالة: ${money(amount)} ${currency}`,
        `المرسل: ${row.sender_name}`,
        `المستلم: ${row.receiver_name}`,
        `رقم الحوالة: ${row.reference_number ?? row.transfer_number ?? row.id}`,
      ]
    : [
        `مقابل تحويل حوالة من حسابكم لدينا إلى: ${row.agent_name ?? "—"} بتاريخ ${row.the_date}`,
        `مبلغ الحوالة: ${money(amount)} ${currency}`,
        `المستلم: ${row.receiver_name} - المرسل: ${row.sender_name}`,
        `رقم الحوالة: ${row.reference_number ?? row.transfer_number ?? row.id}`,
      ];
  if (row.notes) narrative.push(`ملاحظات: ${row.notes}`);
  return {
    side: kind === "incoming" ? "credit" : "debit",
    title: kind === "incoming" ? "إشعار دائن" : "إشعار مدين",
    number: row.document_number != null ? documentNumber(kind, row.document_number) : String(row.transfer_number ?? row.id),
    date: row.the_date,
    party: account.name,
    accountNumber: account.number,
    currency,
    amount,
    amountWords: amountInWords(total, currency),
    fee: fee > 0 ? fee : undefined,
    narrative,
    staff,
    phone: account.phone ?? null,
  };
}

export function journalNotices(
  row: { number: string; date: string; amount: number; currency: string; notes: string | null },
  debit: { name: string; number: string; phone?: string | null },
  credit: { name: string; number: string; phone?: string | null },
  staff: string,
): AccountNotice[] {
  const base = { number: row.number, date: row.date, currency: row.currency, amount: row.amount, amountWords: amountInWords(row.amount, row.currency), staff };
  const extra = row.notes ? [`الملاحظات: ${row.notes}`] : [];
  return [
    { ...base, side: "credit", title: "إشعار دائن", party: credit.name, accountNumber: credit.number, phone: credit.phone ?? null, narrative: [`لكم من حساب: ${debit.name}`, ...extra] },
    { ...base, side: "debit", title: "إشعار مدين", party: debit.name, accountNumber: debit.number, phone: debit.phone ?? null, narrative: [`عليكم إلى حساب: ${credit.name}`, ...extra] },
  ];
}

/** نص إشعار الحساب لرسالة واتساب العميل. */
export function noticeToText(n: AccountNotice): string {
  const lines = [
    n.title,
    `السيد/ ${n.party} — رقم الحساب: ${n.accountNumber}`,
    n.side === "credit" ? "نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية:" : "نود إشعاركم أننا قيدنا على حسابكم لدينا:",
    `المبلغ: ${money(n.amount)} ${n.currency}`,
  ];
  if (n.fee) lines.push(`خدمات التحويل: ${money(n.fee)} ${n.currency}`, `الإجمالي: ${money(n.amount + n.fee)} ${n.currency}`);
  lines.push(n.amountWords, ...n.narrative, `رقم المستند: ${n.number}`, `التاريخ: ${n.date}`);
  return lines.join("\n");
}
