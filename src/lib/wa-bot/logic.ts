/**
 * منطق بوت واتساب الصافي (بلا شبكة ولا قاعدة بيانات) حتى يُختبر مباشرة.
 */

/** يوحّد الرقم إلى أرقام فقط بصيغة دولية؛ أرقام اليمن 7XXXXXXXX تصبح 9677XXXXXXXX. */
export function normalizePhone(raw: string): string {
  let d = (raw ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("7")) d = "967" + d;
  return d;
}

export type OwnerCommand =
  | { kind: "help" }
  | { kind: "pending" }
  | { kind: "today" }
  | { kind: "details"; id: number }
  | { kind: "approve"; id: number; commission: number | null }
  | { kind: "reject"; id: number; reason: string }
  | { kind: "unknown" };

const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));

/** يفهم أوامر المالك المكتوبة في محادثته مع البوت. */
export function parseOwnerCommand(text: string): OwnerCommand {
  const t = toLatinDigits(text.trim()).replace(/\s+/g, " ").replace(/[أإآ]/g, "ا");
  if (!t) return { kind: "unknown" };
  if (/^(مساعده|مساعدة|اوامر|الاوامر|help|\?)$/i.test(t)) return { kind: "help" };
  if (/^(الطلبات|طلبات|المعلق|معلق|المعلقه|المعلقة)$/.test(t)) return { kind: "pending" };
  if (/^(اليوم|ملخص|ملخص اليوم)$/.test(t)) return { kind: "today" };
  let m = t.match(/^(تفاصيل|عرض) #?(\d+)$/);
  if (m) return { kind: "details", id: Number(m[2]) };
  m = t.match(/^(موافقه|موافقة|قبول|اعتماد|نعم) #?(\d+)(?: (?:عموله|عمولة) ([\d.,]+))?$/);
  if (m) {
    const c = m[3] ? Number(m[3].replace(/,/g, "")) : null;
    return { kind: "approve", id: Number(m[2]), commission: c !== null && Number.isFinite(c) && c >= 0 ? c : null };
  }
  m = t.match(/^(رفض|لا) #?(\d+)(?: (.+))?$/);
  if (m) return { kind: "reject", id: Number(m[2]), reason: (m[3] ?? "").slice(0, 200) };
  return { kind: "unknown" };
}

export const OWNER_HELP = [
  "أوامر المالك:",
  "• الطلبات — الطلبات المعلقة",
  "• تفاصيل 12 — تفاصيل طلب",
  "• موافقة 12 — اعتماد طلب",
  "• موافقة 12 عمولة 500 — اعتماد مع عمولة",
  "• رفض 12 السبب — رفض طلب",
  "• اليوم — ملخص طلبات اليوم",
].join("\n");

export const KIND_LABELS: Record<string, string> = {
  transfer_notice: "إشعار حوالة",
  deposit: "طلب إيداع",
  withdrawal: "طلب سحب",
  transfer: "طلب إرسال حوالة",
  balance_inquiry: "استفسار رصيد",
  other: "رسالة أخرى",
};

export const FINANCIAL_KINDS = new Set(["transfer_notice", "deposit", "withdrawal", "transfer", "balance_inquiry"]);

export type Analysis = {
  kind: string;
  summary: string;
  transfer_number: string | null;
  amount: number | null;
  currency: string | null;
  sender: string | null;
  receiver: string | null;
};

/** ينظّف رد الذكاء الاصطناعي إلى شكل ثابت مهما كان. */
export function coerceAnalysis(raw: unknown): Analysis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
  const k = o["kind"];
  const kind = typeof k === "string" && k in KIND_LABELS ? k : "other";
  const rawAmt = o["amount"];
  const amt = typeof rawAmt === "number" ? rawAmt : typeof rawAmt === "string" ? Number(toLatinDigits(rawAmt).replace(/[^\d.]/g, "")) : NaN;
  const num = str(o["transfer_number"]);
  return {
    kind,
    summary: str(o["summary"]) ?? "",
    transfer_number: num ? toLatinDigits(num).replace(/\s+/g, "") : null,
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    currency: str(o["currency"]),
    sender: str(o["sender"]),
    receiver: str(o["receiver"]),
  };
}

/** يلزم إشعار المالك فقط للعمليات المالية الجديدة غير المكررة. */
export function needsOwnerApproval(kind: string, duplicate: boolean): boolean {
  return FINANCIAL_KINDS.has(kind) && !duplicate;
}

export function itemLine(i: { id: number; kind: string; summary: string; amount: number | null; currency: string | null; name?: string | null | undefined }): string {
  const amount = i.amount ? ` — ${i.amount.toLocaleString("en-US")} ${i.currency ?? ""}`.trimEnd() : "";
  return `#${i.id} ${KIND_LABELS[i.kind] ?? i.kind}${i.name ? ` (${i.name})` : ""}${amount}${i.summary ? `\n   ${i.summary}` : ""}`;
}

export type BotSettings = {
  enabled: boolean;
  exchangers_enabled: boolean;
  customers_enabled: boolean;
  owners_enabled: boolean;
  customer_kinds: readonly string[];
};

/** هل يتعامل البوت مع رسالة من هذه الفئة؟ «paused» = نرد برسالة الإيقاف ولا نعالج. */
export function botGate(s: BotSettings, role: string): "ok" | "paused" {
  if (!s.enabled) return "paused";
  if (role === "owner") return s.owners_enabled ? "ok" : "paused";
  if (role === "exchanger") return s.exchangers_enabled ? "ok" : "paused";
  if (role === "customer") return s.customers_enabled ? "ok" : "paused";
  return "paused";
}

/** هل نوع طلب العميل مسموح؟ إشعارات الصرافين لا تتأثر بهذه القائمة. */
export function customerKindAllowed(s: BotSettings, role: string, kind: string): boolean {
  return role !== "customer" || !FINANCIAL_KINDS.has(kind) || s.customer_kinds.includes(kind);
}

/** أرقام المالك التي يُوجَّه إليها نوع الطلب؛ إن لم يُخصَّص لأحد نرسل لكل المالكين حتى لا يضيع الطلب. */
export function routeToOwners<T extends { notify_kinds: readonly string[] }>(owners: readonly T[], kind: string): T[] {
  const matched = owners.filter((o) => o.notify_kinds.includes(kind));
  return matched.length ? matched : [...owners];
}

/** واتساب يسمح بالرد الحر فقط خلال ٢٤ ساعة من آخر رسالة أرسلها العميل. */
export function withinServiceWindow(lastInboundIso: string | null | undefined, nowMs: number): boolean {
  if (!lastInboundIso) return false;
  const t = Date.parse(lastInboundIso);
  return Number.isFinite(t) && nowMs - t < 24 * 3600e3;
}

export type TransferDirection = "incoming" | "outgoing";

/**
 * الاتجاه المقترح عند فتح طلب البوت للحفظ: طلب العميل إرسال حوالة = صادرة،
 * وإشعار الصراف أو طلب استلام حوالة = واردة. الموظف يستطيع تغييره قبل الحفظ.
 */
export function suggestedDirection(kind: string): TransferDirection | null {
  if (kind === "transfer") return "outgoing";
  if (kind === "transfer_notice") return "incoming";
  return null;
}

/** يمكن فتح الطلب للحفظ مرة واحدة فقط: حوالة غير محفوظة، معلقة أو معتمدة. */
export function canOpenForPosting(i: { kind: string; status: string; posted_id: number | null }): boolean {
  return suggestedDirection(i.kind) !== null && i.posted_id == null && (i.status === "pending" || i.status === "approved");
}

const CURRENCY_HINTS: Array<[RegExp, RegExp]> = [
  [/دولار|usd|\$/i, /دولار|usd/i],
  [/سعود|sar/i, /سعود|sar/i],
  [/يمن|yer|ريال$/i, /يمن|yer/i],
  [/درهم|aed/i, /درهم|aed/i],
  [/يورو|eur/i, /يورو|eur/i],
];

/** يطابق اسم العملة الذي قرأه البوت مع عملات النظام؛ لا يخمّن إن لم يجد تطابقًا واضحًا. */
export function matchCurrencyId(name: string | null | undefined, currencies: ReadonlyArray<{ id: number; currency_name: string }>): number | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const exact = currencies.find((c) => c.currency_name.trim() === n);
  if (exact) return exact.id;
  for (const [hint, target] of CURRENCY_HINTS) {
    if (!hint.test(n)) continue;
    const hits = currencies.filter((c) => target.test(c.currency_name));
    if (hits.length === 1) return hits[0]!.id;
  }
  return null;
}

/** حالة رسالة واردة في «الوارد»: تمت المطابقة إن قرأها البوت كطلب، وإلا تحتاج مراجعة. */
export function inboxMatch(item: { status: string } | undefined): "matched" | "review" {
  return item ? "matched" : "review";
}
