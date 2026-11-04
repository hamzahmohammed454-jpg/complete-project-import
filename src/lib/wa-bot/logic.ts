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
  const kind = typeof o.kind === "string" && o.kind in KIND_LABELS ? o.kind : "other";
  const amt = typeof o.amount === "number" ? o.amount : typeof o.amount === "string" ? Number(toLatinDigits(o.amount).replace(/[^\d.]/g, "")) : NaN;
  const num = str(o.transfer_number);
  return {
    kind,
    summary: str(o.summary) ?? "",
    transfer_number: num ? toLatinDigits(num).replace(/\s+/g, "") : null,
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    currency: str(o.currency),
    sender: str(o.sender),
    receiver: str(o.receiver),
  };
}

/** يلزم إشعار المالك فقط للعمليات المالية الجديدة غير المكررة. */
export function needsOwnerApproval(kind: string, duplicate: boolean): boolean {
  return FINANCIAL_KINDS.has(kind) && !duplicate;
}

export function itemLine(i: { id: number; kind: string; summary: string; amount: number | null; currency: string | null; name?: string | null }): string {
  const amount = i.amount ? ` — ${i.amount.toLocaleString("en-US")} ${i.currency ?? ""}`.trimEnd() : "";
  return `#${i.id} ${KIND_LABELS[i.kind] ?? i.kind}${i.name ? ` (${i.name})` : ""}${amount}${i.summary ? `\n   ${i.summary}` : ""}`;
}
