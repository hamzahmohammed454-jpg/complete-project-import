// Pure helpers for the offline outbox (no browser APIs) so they can be tested.

export type OutboxStatus = "pending" | "syncing" | "failed";

export type OutboxItem = {
  ownerId?: string;
  id: string;
  createdAt: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  /** Temporary id given to the row created offline, replaced after sync. */
  tempId: string | null;
  label: string;
  status: OutboxStatus;
  error?: string;
};

export const TEMP_PREFIX = "pending-";
export const PENDING_LABEL = "قيد المزامنة";

/** Replace every known temporary id with the real server id. */
export function remapIds(text: string, map: Record<string, string | number>): string {
  let out = text;
  for (const [temp, real] of Object.entries(map)) {
    out = out.split(`"${temp}"`).join(typeof real === "number" ? String(real) : `"${real}"`);
    out = out.split(temp).join(String(real));
  }
  return out;
}

/** Items still referencing a temporary id that has no real id yet. */
export function hasUnresolvedTemp(item: OutboxItem, map: Record<string, unknown>): boolean {
  const text = item.url + (item.body ?? "");
  const found = text.match(new RegExp(`${TEMP_PREFIX}[a-z0-9-]+`, "g")) ?? [];
  return found.some((t) => t !== item.tempId && !(t in map));
}

/** Arabic, user-facing reason a queued operation was refused by the server. */
export function syncErrorMessage(status: number, body: string): string {
  const b = body || "";
  if (b.includes("LICENSE_READ_ONLY")) return "انتهت صلاحية تسجيل العمليات؛ أدخل كود التفعيل ثم أعد المزامنة";
  if (b.includes("NO_PERMISSION") || status === 401 || status === 403 || b.includes("row-level security"))
    return "لا تملك صلاحية تنفيذ هذه العملية";
  if (/closed|مقفل|إقفال|box_closing/i.test(b)) return "يوم الصندوق مقفل — لا يمكن تسجيل حركة فيه";
  if (/insufficient|رصيد/i.test(b)) return "الرصيد غير كافٍ لتنفيذ العملية";
  if (/immutable|cannot be (changed|undone)|لا يمكن/i.test(b)) return "العملية مُرحّلة ولا يمكن تعديلها";
  if (b.includes("23505")) return "العملية مسجّلة مسبقًا أو القيمة مستخدمة لسجل آخر";
  if (b.includes("23503")) return "العملية مرتبطة بسجل غير موجود أو محذوف";
  try {
    const msg = (JSON.parse(b) as { message?: string }).message;
    if (msg) return `رفض الخادم العملية: ${msg}`;
  } catch {
    /* not json */
  }
  return "تعذّرت مزامنة العملية";
}

const TABLE_LABELS: Record<string, string> = {
  buy_currencies: "سند شراء", sell_currencies: "سند بيع", outgoing_transfers: "حوالة صادرة", incoming_transfers: "حوالة واردة", cash_vouchers: "سند نقدي", journal_vouchers: "سند قيد", agent_settlements: "تسوية وكيل",
  exchange_operations: "بيع/شراء عملة",
  transfers: "حوالة",
  vouchers: "سند",
  journal_entries: "قيد",
  checks: "شيك",
  customers: "عميل",
  agents: "وكيل",
};

export function describeRequest(method: string, url: string): string {
  const path = new URL(url).pathname;
  const rpc = path.match(/\/rpc\/([^/]+)/);
  if (rpc) return `عملية: ${rpc[1]}`;
  const table = path.split("/").pop() ?? "";
  const name = TABLE_LABELS[table] ?? table;
  const verb = method === "POST" ? "إضافة" : method === "DELETE" ? "حذف" : "تعديل";
  return `${verb} ${name}`;
}

/** Operation tables that accept a device reference so a resend is never saved twice. */
export const CLIENT_REF_TABLES = new Set([
  "buy_currencies", "sell_currencies", "outgoing_transfers", "incoming_transfers",
  "cash_vouchers", "journal_vouchers", "checks", "agent_settlements", "box_movements",
  "customers", "agents",
]);

export function tableOf(url: string): string {
  return new URL(url).pathname.split("/").pop() ?? "";
}

/** Adds client_ref to an offline insert body for supported tables. */
export function withClientRef(url: string, body: string | null, ref: string): string | null {
  if (!body || !CLIENT_REF_TABLES.has(tableOf(url))) return body;
  try {
    const parsed = JSON.parse(body);
    const add = (r: Record<string, unknown>) => ({ ...r, client_ref: ref });
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(add) : add(parsed));
  } catch {
    return body;
  }
}

/** A resend refused only because the same operation is already saved. */
export function isAlreadySaved(status: number, body: string): boolean {
  return (status === 409 || body.includes("23505")) && body.includes("client_ref");
}

export function requestUserId(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const token = authorization.slice(7).split(".")[1]; if (!token) return null;
    const payload = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown };
    return typeof payload.sub === "string" && /^[a-f0-9-]{36}$/i.test(payload.sub) ? payload.sub : null;
  } catch { return null; }
}
export function canReplayAs(item: OutboxItem, ownerId: string | null): boolean {
  return Boolean(ownerId && item.ownerId === ownerId);
}

/** Only audited single-row creates can become pending intents, never PATCH/DELETE/RPC. */
export const OFFLINE_INSERT_TABLES = new Set([
  "buy_currencies", "sell_currencies", "outgoing_transfers", "incoming_transfers", "customers",
]);

export function canQueueRequest(method: string, url: string, body: string | null): boolean {
  if (method !== "POST" || new URL(url).pathname.includes("/rpc/") || !OFFLINE_INSERT_TABLES.has(tableOf(url))) return false;
  if (new URL(url).searchParams.has("on_conflict")) return false;
  try {
    const row = JSON.parse(body ?? "null");
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (tableOf(url) === "outgoing_transfers" && (row.payment_method === "check" || row.check_id != null)) return false;
    return true;
  } catch { return false; }
}

export function pendingResult(data: unknown): boolean {
  return Array.isArray(data) && data.some((row) => row && typeof row === "object" && row._pending === true);
}

export function dependentItemIds(items: OutboxItem[], id: string): Set<string> {
  const blocked = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    const temps = items.filter((item) => blocked.has(item.id)).flatMap((item) => item.tempId ? [item.tempId] : []);
    for (const item of items) {
      if (!blocked.has(item.id) && temps.some((temp) => (item.url + (item.body ?? "")).includes(temp))) {
        blocked.add(item.id); changed = true;
      }
    }
  }
  blocked.delete(id);
  return blocked;
}
