// @ts-nocheck -- unused offline prototype imported as-is from the original project
// The money rules of the system, mirrored from the cloud database so the
// offline copy computes balances, numbers and receipts exactly the same way.
import { getTables, maxNumber, nextId, saveTables, tableOf, type Row } from "./store";

export interface Ctx {
  uid: string | null;
}

export class RuleError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const nowIso = () => new Date().toISOString();

export function adenDate(ts: unknown): string {
  const d = ts instanceof Date ? ts : new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aden",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

const today = () => adenDate(new Date());

const DEFAULTS: Record<string, Row> = {
  outgoing_transfers: { state: "معلقة", delivered: false, canceled: false, branch_commission: 0, payment_method: "cash", is_internal: false },
  incoming_transfers: { state: "معلقة", delivered: false, canceled: false, branch_commission: 0, payment_method: "cash" },
  checks: { status: "تحت التحصيل" },
  box_movements: { movement_type: "قبض", amount: 0 },
  box_closings: { system_balance: 0 },
  cash_vouchers: {},
  buy_currencies: { commission: 0 },
  sell_currencies: { commission: 0 },
  customer_transfer_movements: { debit: 0, credit: 0 },
  entries: { debited: true },
  entries_details: { side: "مدين", amount: 0 },
  currency_prices: { exchange_price: 0, buy_price: 0, sell_price: 0, min_price: 0, max_price: 0 },
  accounts: { account_type: "فرعي" },
  auto_reply_settings: { phone_number: "", display_name: "", instructions_hours: 24, enabled: false, instructions_enabled: false },
};

const DATE_COLUMNS = new Set(["the_date", "close_date", "collected_date", "due_date", "from_date", "to_date"]);

function applyDefaults(table: string, row: Row, ctx: Ctx) {
  const d = DEFAULTS[table];
  if (d) for (const [k, v] of Object.entries(d)) if (row[k] === undefined) row[k] = v;
  if (row.created_at === undefined) row.created_at = nowIso();
  if ("created_by" in row === false && Object.prototype.hasOwnProperty.call(row, "created_by") === false) {
    if (["accounts", "branches", "currencies", "boxes", "customers", "agents", "box_movements", "cash_vouchers", "checks", "entries", "journal_vouchers", "buy_currencies", "sell_currencies", "agent_settlements", "account_groups", "classifications", "user_groups", "user_group_members", "currency_prices"].includes(table)) {
      row.created_by = ctx.uid;
    }
  }
  if ("created_by" in row && row.created_by === undefined) row.created_by = ctx.uid;
  for (const col of DATE_COLUMNS) if (row[col] === undefined && tableHasColumn(table, col)) row[col] = today();
}

const KNOWN_COLUMNS: Record<string, string[]> = {};
export function declareColumns(table: string, cols: string[]) {
  KNOWN_COLUMNS[table] = cols;
}
function tableHasColumn(table: string, col: string) {
  const known = KNOWN_COLUMNS[table];
  if (!known) return true;
  return known.includes(col);
}

// ---------------------------------------------------------------- helpers

function postBox(boxId: unknown, currencyId: unknown, amount: unknown, type: string, notes: string, src: string, srcId: unknown, ctx: Ctx) {
  const amt = Number(amount ?? 0);
  if (boxId == null || amount == null || amt === 0) return;
  applyInsert(
    "box_movements",
    { box_id: Number(boxId), currency_id: currencyId == null ? null : Number(currencyId), amount: amt, movement_type: type, notes, source_type: src, source_id: srcId == null ? null : Number(srcId), created_by: ctx.uid },
    ctx,
  );
}

function removeBoxMovements(src: string, srcId: unknown) {
  const rows = tableOf("box_movements");
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].source_type === src && String(rows[i].source_id) === String(srcId)) rows.splice(i, 1);
}

export function hasRole(uid: string | null, role: string, ctx: Ctx = { uid: null }): boolean {
  if (!uid) return false;
  return tableOf("user_roles").some((r) => String(r.user_id) === String(uid) && r.role === role);
}

export function isAdmin(uid: string | null, ctx: Ctx = { uid: null }): boolean {
  return hasRole(uid, "admin", ctx);
}

export function hasScreenPermission(screen: string, action: string, ctx: Ctx): boolean {
  const uid = ctx.uid;
  if (!uid) return false;
  if (isAdmin(uid, ctx)) return true;
  if (!["view", "create", "update", "delete", "print"].includes(action)) return false;
  const own = tableOf("user_screen_permissions").find((p) => String(p.user_id) === String(uid) && p.screen_path === screen);
  if (own) {
    const byAction = action === "view" ? true : action === "create" ? own.can_create : action === "update" ? own.can_update : action === "delete" ? own.can_delete : own.can_print;
    return Boolean(own.can_view) && Boolean(byAction);
  }
  const members = tableOf("user_group_members").filter((m) => String(m.user_id) === String(uid));
  if (members.length === 0) return true;
  let permitted = false;
  for (const m of members) {
    const group = tableOf("user_groups").find((g) => String(g.id) === String(m.group_id));
    if (!group) continue;
    const row = tableOf("group_screen_permissions").find((p) => String(p.group_id) === String(m.group_id) && p.screen_path === screen);
    let allowed: boolean;
    if (row) {
      const byAction = action === "view" ? true : action === "create" ? row.can_create : action === "update" ? row.can_update : action === "delete" ? row.can_delete : action === "print" ? row.can_print : false;
      allowed = Boolean(row.can_view) && Boolean(byAction);
    } else {
      const list: string[] = Array.isArray(group.allowed_screens) ? group.allowed_screens : [];
      allowed = list.length === 0 || list.includes(screen);
    }
    permitted = permitted || allowed;
  }
  return permitted;
}

// ------------------------------------------------------------- audit trail

function audit(table: string, op: "INSERT" | "UPDATE" | "DELETE", oldRow: Row | null, newRow: Row | null, ctx: Ctx) {
  if (table === "activity_log") return;
  const action = op === "INSERT" ? "إضافة" : op === "UPDATE" ? "تعديل" : "حذف";
  const details = op === "UPDATE" ? { before: oldRow, after: newRow } : op === "DELETE" ? oldRow : newRow;
  const profile = tableOf("profiles").find((p) => String(p.id) === String(ctx.uid));
  applyInsert(
    "activity_log",
    { user_id: ctx.uid, username: profile ? profile.username || profile.full_name : null, action, target: table, details },
    { uid: ctx.uid },
  );
}

// ----------------------------------------------------------- write pipeline

const BEFORE_INSERT: Record<string, Array<(row: Row, ctx: Ctx) => void>> = {
  outgoing_transfers: [guardInternalInsert, validateTransferPayment, guardStaffAssignment, transferAutonumber, validateTransferCheck],
  incoming_transfers: [guardInternalInsertIncoming, validateTransferPayment, guardStaffAssignment, transferAutonumber],
  checks: [checksAutonumber, guardStaffAssignment],
  buy_currencies: [validateExchangePayment, guardStaffAssignment, setupAutonumber("the_number")],
  sell_currencies: [validateExchangePayment, guardStaffAssignment, setupAutonumber("the_number")],
  agent_settlements: [guardStaffAssignment],
  cash_vouchers: [simpleAutonumber("the_number"), guardStaffAssignment],
  journal_vouchers: [guardStaffAssignment, simpleAutonumber("the_number")],
  box_closings: [closingComputeBalance, guardStaffAssignment],
  box_movements: [guardClosedBoxInsert, guardStaffAssignment],
  entries: [entryPeriodGuard],
  entries_details: [guardStaffAssignment],
  accounts: [accountsAutonumber],
  customers: [partyAutoaccount],
  agents: [partyAutoaccount],
  boxes: [partyAutoaccount],
  staff_work_defaults: [validateStaffWorkDefaults],
  activity_log: [activityUsername],
};

const BEFORE_UPDATE: Record<string, Array<(next: Row, prev: Row, ctx: Ctx) => void>> = {
  outgoing_transfers: [guardInternalUpdate, validateTransferPaymentUpdate, guardStaffAssignment, guardTransferState, validateTransferCheckUpdate],
  incoming_transfers: [guardInternalUpdateIncoming, validateTransferPaymentUpdate, guardStaffAssignment, guardTransferStateIncoming],
  checks: [guardLinkedTransferCheckUpdate, guardStaffAssignment],
  buy_currencies: [guardStaffAssignment],
  sell_currencies: [guardStaffAssignment],
  agent_settlements: [guardStaffAssignment],
  cash_vouchers: [guardStaffAssignment],
  journal_vouchers: [guardStaffAssignment],
  box_closings: [guardStaffAssignment],
  box_movements: [guardStaffAssignment],
  entries_details: [guardStaffAssignment],
  staff_work_defaults: [validateStaffWorkDefaults],
  profiles: [touchUpdatedAt],
};

const AFTER_INSERT: Record<string, Array<(row: Row, ctx: Ctx) => void>> = {
  outgoing_transfers: [transferToCustomerOutgoingInsert, opsToBoxOutgoingInsert, routeInternalOutgoingInsert],
  incoming_transfers: [],
  checks: [],
  buy_currencies: [opsToBoxBuy, exchangeToCustomer("buy_currencies", 1)],
  sell_currencies: [opsToBoxSell, exchangeToCustomer("sell_currencies", 1)],
  agent_settlements: [opsToBoxSettlement],
  cash_vouchers: [cashVoucherToBoxInsert],
  journal_vouchers: [journalVoucherToEntryInsert],
  box_movements: [],
  entries: [],
};

const AFTER_UPDATE: Record<string, Array<(next: Row, prev: Row, ctx: Ctx) => void>> = {
  outgoing_transfers: [transferToCustomerOutgoingUpdate, opsToBoxOutgoingUpdate, routeInternalOutgoingUpdate],
  incoming_transfers: [transferToCustomerIncomingUpdate, opsToBoxIncomingUpdate, routeInternalIncomingUpdate],
  checks: [checkToBoxUpdate],
  customers: [partySyncAccount],
  agents: [partySyncAccount],
  boxes: [partySyncAccount],
};

const AFTER_DELETE: Record<string, Array<(row: Row, ctx: Ctx) => void>> = {
  outgoing_transfers: [opsToBoxOutgoingDelete],
  incoming_transfers: [opsToBoxIncomingDelete],
  buy_currencies: [opsToBoxOpsDelete("buy_currencies"), exchangeToCustomer("buy_currencies", -1)],
  sell_currencies: [opsToBoxOpsDelete("sell_currencies"), exchangeToCustomer("sell_currencies", -1)],
  agent_settlements: [opsToBoxSettlementDelete],
  cash_vouchers: [cashVoucherToBoxDelete],
  journal_vouchers: [journalVoucherToEntryDelete],
  checks: [checkToBoxDelete],
  customers: [partyDropAccount],
  agents: [partyDropAccount],
  boxes: [partyDropAccount],
};

const BEFORE_DELETE: Record<string, Array<(row: Row, ctx: Ctx) => void>> = {
  box_movements: [guardClosedBoxDelete],
  accounts: [accountsGuardDelete],
  boxes: [boxesGuardDelete],
  outgoing_transfers: [validateTransferPaymentDelete],
  incoming_transfers: [validateTransferPaymentDelete],
};

function run(list: Array<(...a: any[]) => void> | undefined, ...args: any[]) {
  for (const fn of list ?? []) fn(...args);
}

export function applyInsert(table: string, input: Row, ctx: Ctx): Row {
  const row: Row = { ...input };
  applyDefaults(table, row, ctx);
  run(BEFORE_INSERT[table], row, ctx);
  if (row.id == null) row.id = nextId(table);
  tableOf(table).push(row);
  audit(table, "INSERT", null, row, ctx);
  run(AFTER_INSERT[table], row, ctx);
  return row;
}

export function applyUpdate(table: string, prev: Row, patch: Row, ctx: Ctx): Row {
  const next: Row = { ...prev, ...patch };
  run(BEFORE_UPDATE[table], next, prev, ctx);
  Object.assign(prev, next);
  audit(table, "UPDATE", { ...prev, ...patch }, prev, ctx);
  run(AFTER_UPDATE[table], prev, { ...prev, ...patch }, ctx);
  return prev;
}

export function applyDelete(table: string, row: Row, ctx: Ctx) {
  run(BEFORE_DELETE[table], row, ctx);
  const rows = tableOf(table);
  const i = rows.indexOf(row);
  if (i >= 0) rows.splice(i, 1);
  audit(table, "DELETE", row, null, ctx);
  run(AFTER_DELETE[table], row, ctx);
}

// ------------------------------------------------------------- the rules

function setupAutonumber(column: string) {
  return (row: Row) => {
    if (row[column] == null || Number(row[column]) === 0) row[column] = maxNumber(tableOfName(row), column) + 1;
  };
}
function tableOfName(row: Row) {
  return (row as any).__table ?? "";
}

function simpleAutonumber(column: string) {
  return (row: Row, _ctx: Ctx, table?: string) => {
    if (row[column] == null || Number(row[column]) === 0) row[column] = maxNumber((row as any).__table ?? "", column) + 1;
  };
}

const AUTONUMBER_TABLES = ["branches", "account_groups", "classifications", "user_groups", "countries", "governorates", "areas", "blacklist", "forbidden_texts", "receiver_cards", "transfer_entities", "transfer_purposes", "checks", "cash_vouchers", "journal_vouchers"];

function autonumber(table: string, column: string) {
  return (row: Row) => {
    if (row[column] == null || Number(row[column]) === 0) row[column] = maxNumber(table, column) + 1;
  };
}

// تصريحات دوال (وليست ثوابت) حتى تكون جاهزة عند بناء جداول القواعد أعلى الملف
function checksAutonumber(row: Row) { autonumber("checks", "the_number")(row); }
function simpleAutonumberCash(row: Row) { autonumber("cash_vouchers", "the_number")(row); }
function simpleAutonumberJournal(row: Row) { autonumber("journal_vouchers", "the_number")(row); }

function transferAutonumber(row: Row) {
  if (row.transfer_number == null || Number(row.transfer_number) === 0) {
    const table = (row as any).__sourceTable ?? "outgoing_transfers";
    const agent = row.agent_id == null ? null : Number(row.agent_id);
    const n =
      maxNumber(
        table,
        "transfer_number",
        (r) => (r.agent_id == null ? null : Number(r.agent_id)) === agent,
      ) + 1;
    row.transfer_number = n;
  }
}

function accountsAutonumber(row: Row) {
  if (row.account_number == null || Number(row.account_number) === 0) {
    const father = row.father_number == null ? null : Number(row.father_number);
    if (father == null) {
      row.account_number = maxNumber("accounts", "account_number", (r) => r.father_number == null) + 1;
    } else {
      const n = maxNumber("accounts", "account_number", (r) => Number(r.father_number) === father);
      row.account_number = n > 0 ? n + 1 : father * 100 + 1;
    }
  }
}

function partyAutoaccount(row: Row, ctx: Ctx) {
  const table = (row as any).__sourceTable;
  let parent = 0;
  let name = "";
  if (table === "agents") {
    parent = 13;
    name = row.agent_name;
    if (row.the_number == null || Number(row.the_number) === 0) row.the_number = maxNumber("agents", "the_number") + 1;
  } else if (table === "boxes") {
    parent = 11;
    name = row.box_name;
    if (row.the_number == null || Number(row.the_number) === 0) row.the_number = maxNumber("boxes", "the_number") + 1;
  } else {
    parent = 14;
    name = row.full_name;
    if (row.the_user_id == null || Number(row.the_user_id) === 0) row.the_user_id = maxNumber("customers", "the_user_id") + 1;
  }
  if (row.account_id == null && tableOf("accounts").some((a) => Number(a.account_number) === parent)) {
    const created = applyInsert("accounts", { account_number: 0, father_number: parent, account_name: name, account_type: "فرعي", branch_id: row.branch_id ?? null, created_by: ctx.uid }, ctx);
    row.account_id = created.id;
  }
}

function partySyncAccount(next: Row) {
  const table = (next as any).__sourceTable;
  const name = table === "agents" ? next.agent_name : table === "boxes" ? next.box_name : next.full_name;
  if (next.account_id != null) {
    const acc = tableOf("accounts").find((a) => String(a.id) === String(next.account_id));
    if (acc && acc.account_name !== name) acc.account_name = name;
  }
}

function partyDropAccount(row: Row) {
  if (row.account_id != null) {
    const rows = tableOf("accounts");
    const i = rows.findIndex((a) => String(a.id) === String(row.account_id));
    if (i >= 0) rows.splice(i, 1);
  }
}

function closingComputeBalance(row: Row, ctx: Ctx) {
  const sum = tableOf("box_movements")
    .filter((m) => Number(m.box_id) === Number(row.box_id) && String(m.currency_id) === String(row.currency_id) && adenDate(m.created_at) <= String(row.close_date))
    .reduce((s, m) => s + (m.movement_type === "صرف" ? -Number(m.amount) : Number(m.amount)), 0);
  row.system_balance = sum;
  row.closed_by = ctx.uid;
}

function guardClosedBoxInsert(row: Row) {
  const day = today();
  const closed = tableOf("box_closings").some(
    (c) => Number(c.box_id) === Number(row.box_id) && String(c.currency_id) === String(row.currency_id ?? null) && String(c.close_date) >= day,
  );
  if (closed) throw new RuleError("BOX_CLOSED: الصندوق مقفل لهذا اليوم");
}

function guardClosedBoxDelete(row: Row) {
  const day = adenDate(row.created_at);
  const closed = tableOf("box_closings").some(
    (c) => Number(c.box_id) === Number(row.box_id) && String(c.currency_id) === String(row.currency_id ?? null) && String(c.close_date) >= day,
  );
  if (closed) throw new RuleError("BOX_CLOSED: الصندوق مقفل لهذا اليوم");
}

function accountsGuardDelete(row: Row) {
  if (tableOf("accounts").some((a) => Number(a.father_number) === Number(row.account_number))) throw new RuleError("HAS_CHILDREN");
}

function boxesGuardDelete(row: Row) {
  if (tableOf("box_movements").some((m) => Number(m.box_id) === Number(row.id)) || tableOf("box_closings").some((c) => Number(c.box_id) === Number(row.id))) throw new RuleError("IN_USE");
}

function entryPeriodGuard(row: Row) {
  const d = String(row.the_date);
  if (tableOf("period_closings").some((p) => d >= String(p.from_date) && d <= String(p.to_date))) throw new RuleError(`الفترة المحاسبية لهذا التاريخ (${d}) مقفلة`);
}

function touchUpdatedAt(next: Row) {
  next.updated_at = nowIso();
}

function activityUsername(row: Row) {
  const profile = tableOf("profiles").find((p) => String(p.id) === String(row.user_id));
  if (profile) row.username = profile.username || profile.full_name;
}

function validateStaffWorkDefaults(next: Row, _prev: Row | null, ctx: Ctx) {
  if (next.enforce_box && next.box_id == null) throw new RuleError("ASSIGNED_BOX_REQUIRED");
  if (next.enforce_currency && next.currency_id == null) throw new RuleError("ASSIGNED_CURRENCY_REQUIRED");
  if (next.box_id != null && next.branch_id != null && !tableOf("boxes").some((b) => Number(b.id) === Number(next.box_id) && Number(b.branch_id) === Number(next.branch_id))) throw new RuleError("BOX_BRANCH_MISMATCH");
  next.updated_at = nowIso();
  next.updated_by = ctx.uid;
}

function guardStaffAssignment(row: Row, ctx: Ctx) {
  if (!ctx.uid) return;
  const d = tableOf("staff_work_defaults").find((s) => String(s.user_id) === String(ctx.uid));
  if (!d) return;
  const table = (row as any).__sourceTable;
  if (d.enforce_currency && "currency_id" in row && Number(row.currency_id ?? -1) !== Number(d.currency_id ?? -2)) throw new RuleError("STAFF_CURRENCY_RESTRICTED");
  if (d.enforce_box && "box_id" in row) {
    if (row.payment_method === "account" || row.payment_method === "check") return;
    if (table === "incoming_transfers" && !row.delivered) return;
    if (table === "checks" && row.status !== "محصل" && row.box_id == null) return;
    if (Number(row.box_id ?? -1) !== Number(d.box_id ?? -2)) throw new RuleError("STAFF_BOX_RESTRICTED");
  }
}

// ---- transfers -----------------------------------------------------------

function guardInternalInsert(row: Row) {
  row.is_internal = Boolean(row.is_internal) || String(row.destination_name ?? "").trim() === "المركز الرئيسي";
  if (row.is_internal) {
    row.destination_name = "المركز الرئيسي";
    row.agent_id = null;
  }
}

function guardInternalUpdate(next: Row, prev: Row) {
  if (prev.is_internal && (next.is_internal !== prev.is_internal || next.destination_name !== prev.destination_name)) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if (next.is_internal !== prev.is_internal) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if (prev.is_internal) {
    if (next.exported_at != null) throw new RuleError("INTERNAL_TRANSFER_NO_EXPORT");
    if (next.delivered && !prev.delivered && !tableOf("incoming_transfers").some((i) => Number(i.internal_outgoing_id) === Number(prev.id) && i.delivered)) throw new RuleError("INTERNAL_TRANSFER_DELIVER_INCOMING");
  }
}

function guardInternalInsertIncoming(row: Row) {
  if (row.internal_outgoing_id != null) {
    const src = tableOf("outgoing_transfers").find((o) => Number(o.id) === Number(row.internal_outgoing_id));
    if (!src || !src.is_internal) throw new RuleError("INVALID_INTERNAL_TRANSFER");
  }
}

function guardInternalUpdateIncoming(next: Row, prev: Row) {
  if (next.internal_outgoing_id !== prev.internal_outgoing_id) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if (next.internal_outgoing_id != null) {
    const src = tableOf("outgoing_transfers").find((o) => Number(o.id) === Number(next.internal_outgoing_id));
    if (!src || !src.is_internal) throw new RuleError("INVALID_INTERNAL_TRANSFER");
    const same = ["sender_name", "receiver_name", "source_name", "destination_name", "reference_number"].every((k) => next[k] === prev[k]);
    if (!same) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
    if (next.delivered && !prev.delivered && (src.canceled || src.delivered)) throw new RuleError("INVALID_INTERNAL_TRANSFER_STATE");
    if (next.canceled && !prev.canceled && !src.canceled) throw new RuleError("INTERNAL_TRANSFER_CANCEL_OUTGOING");
  }
}

function validateTransferPayment(row: Row, ctx: Ctx) {
  const table = (row as any).__sourceTable ?? "outgoing_transfers";
  if (Number(row.amount) <= 0 || Number(row.branch_commission ?? 0) < 0) throw new RuleError("INVALID_TRANSFER_AMOUNT");
  if (row.delivered || row.canceled || row.exported_at != null) throw new RuleError("INVALID_INITIAL_TRANSFER_STATE");
  row.created_by = ctx.uid;
  if (row.payment_method === "account") {
    const customer = tableOf("customers").find((c) => Number(c.id) === Number(row.customer_id));
    if (!customer || customer.account_id == null) throw new RuleError("TRANSFER_CUSTOMER_REQUIRED");
    row.box_id = null;
  } else if (row.payment_method === "check") {
    row.box_id = null;
  } else if (table === "outgoing_transfers" || row.delivered) {
    if (row.box_id == null) throw new RuleError("TRANSFER_BOX_REQUIRED");
  }
  const d = tableOf("staff_work_defaults").find((s) => String(s.user_id) === String(ctx.uid));
  if (row.payment_method === "cash" && d?.enforce_box && (table === "outgoing_transfers" || row.delivered) && Number(row.box_id ?? -1) !== Number(d.box_id ?? -2)) throw new RuleError("STAFF_BOX_RESTRICTED");
}

function validateTransferPaymentUpdate(next: Row, prev: Row, ctx: Ctx) {
  const table = (next as any).__sourceTable ?? "outgoing_transfers";
  if ((prev.canceled && !next.canceled) || (prev.delivered && !next.delivered)) throw new RuleError("TRANSFER_REVERSE_FORBIDDEN");
  if (next.delivered && next.canceled) throw new RuleError("INVALID_TRANSFER_STATE");
  const moneySame = ["amount", "currency_id", "branch_commission", "commission_currency_id", "agent_id", "the_date"].every((k) => same(next[k], prev[k]));
  if (!moneySame) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if ((table === "outgoing_transfers" || prev.delivered) && !(same(next.payment_method, prev.payment_method) && same(next.customer_id, prev.customer_id) && same(next.box_id, prev.box_id))) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if (prev.exported_at != null && !(same(next.exported_at, prev.exported_at) && same(next.export_agent_id, prev.export_agent_id))) throw new RuleError("TRANSFER_EXPORT_IMMUTABLE");
  if (next.exported_at != null && prev.exported_at == null) {
    if (next.canceled || next.delivered || next.export_agent_id == null || !same(next.export_agent_id, next.agent_id)) throw new RuleError("TRANSFER_EXPORT_AGENT_REQUIRED");
    next.exported_at = nowIso();
    next.exported_by = ctx.uid;
  }
  const d = tableOf("staff_work_defaults").find((s) => String(s.user_id) === String(ctx.uid));
  if (next.payment_method === "cash" && d?.enforce_box && (table === "outgoing_transfers" || next.delivered) && Number(next.box_id ?? -1) !== Number(d.box_id ?? -2)) throw new RuleError("STAFF_BOX_RESTRICTED");
}

function validateTransferPaymentDelete(_row: Row, ctx: Ctx) {
  if (ctx.uid) throw new RuleError("TRANSFER_DELETE_FORBIDDEN");
}

function same(a: unknown, b: unknown) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a) === String(b);
}

function validateTransferCheck(row: Row) {
  if (row.payment_method === "check") {
    const check = tableOf("checks").find((c) => Number(c.id) === Number(row.check_id));
    if (!check || check.check_type !== "وارد" || check.status === "مرتجع") throw new RuleError("TRANSFER_CHECK_REQUIRED");
    const checkTotal = Number(check.amount);
    if (Number(check.currency_id) !== Number(row.currency_id) || checkTotal !== Number(row.amount) + Number(row.branch_commission ?? 0) || !same(row.commission_currency_id ?? row.currency_id, row.currency_id)) throw new RuleError("TRANSFER_CHECK_AMOUNT_MISMATCH");
    row.box_id = null;
  } else if (row.check_id != null) {
    throw new RuleError("TRANSFER_CHECK_METHOD_REQUIRED");
  }
}

function validateTransferCheckUpdate(next: Row, prev: Row) {
  validateTransferCheck(next);
  if (!same(next.check_id, prev.check_id)) throw new RuleError("TRANSFER_FINANCE_IMMUTABLE");
  if (next.payment_method === "check" && next.canceled && !prev.canceled) throw new RuleError("TRANSFER_CHECK_CANCEL_REQUIRES_SETTLEMENT");
}

function guardLinkedTransferCheckUpdate(next: Row, prev: Row) {
  const linked = tableOf("outgoing_transfers").some((o) => Number(o.check_id) === Number(prev.id));
  if (!linked) return;
  const moneySame = ["amount", "currency_id", "check_type", "check_number", "customer_id"].every((k) => same(next[k], prev[k]));
  if (!moneySame) throw new RuleError("TRANSFER_CHECK_IMMUTABLE");
  if (prev.status === "محصل" && (next.status !== prev.status || !same(next.box_id, prev.box_id))) throw new RuleError("TRANSFER_CHECK_ALREADY_COLLECTED");
}

function guardTransferState(next: Row, prev: Row, ctx: Ctx) {
  const mgr = isAdmin(ctx.uid, ctx) || hasRole(ctx.uid, "manager", ctx);
  if (next.canceled && !prev.canceled) {
    if (!mgr) throw new RuleError("FORBIDDEN_CANCEL: إلغاء الحوالة للمدير فقط");
    if (prev.delivered) throw new RuleError("DELIVERED: لا تُلغى حوالة مسلّمة");
    next.state = "ملغاة";
  }
  if (prev.canceled && !next.canceled && !mgr) throw new RuleError("FORBIDDEN_CANCEL");
  if (prev.delivered && !next.delivered && !mgr) throw new RuleError("FORBIDDEN_UNDELIVER");
  if (next.delivered && !prev.delivered) {
    if (prev.canceled) throw new RuleError("CANCELED: الحوالة ملغاة");
    next.state = "مسلّمة";
  }
}

function guardTransferStateIncoming(next: Row, prev: Row, ctx: Ctx) {
  guardTransferState(next, prev, ctx);
  if (next.delivered && !prev.delivered) {
    next.delivered_at = nowIso();
    next.delivered_by = ctx.uid;
  }
}

// ---- cash effects --------------------------------------------------------

function opsToBoxBuy(row: Row, ctx: Ctx) {
  const ref = `شراء رقم ${row.the_number ?? row.id}`;
  postBox(row.box_id, row.currency_id, row.amount, "قبض", ref, "buy_currencies", row.id, ctx);
  postBox(row.box_id, row.exchange_currency_id, row.exchange_amount, "صرف", ref, "buy_currencies", row.id, ctx);
  postBox(row.box_id, row.exchange_currency_id, row.commission, "قبض", `عمولة ${ref}`, "buy_currencies", row.id, ctx);
}

function opsToBoxSell(row: Row, ctx: Ctx) {
  const ref = `بيع رقم ${row.the_number ?? row.id}`;
  postBox(row.box_id, row.currency_id, row.amount, "صرف", ref, "sell_currencies", row.id, ctx);
  postBox(row.box_id, row.exchange_currency_id, row.exchange_amount, "قبض", ref, "sell_currencies", row.id, ctx);
  postBox(row.box_id, row.exchange_currency_id, row.commission, "قبض", `عمولة ${ref}`, "sell_currencies", row.id, ctx);
}

// مرآة validate_exchange_payment: عملية الحساب تحتاج عميلاً ولا تمس الصندوق
function validateExchangePayment(row: Row) {
  if (row.payment_method === "account") {
    if (row.customer_id == null) throw new RuleError("EXCHANGE_CUSTOMER_REQUIRED");
    row.box_id = null;
    const c = tableOf("customers").find((x) => String(x.id) === String(row.customer_id));
    row.account_id = c?.account_id ?? null;
  } else {
    row.payment_method = "cash";
    row.customer_id = null;
  }
}

// مرآة exchange_to_customer: البيع والشراء من الحساب يُرحَّل بالعملتين، والحذف يرحّل عكسه
function exchangeToCustomer(table: "buy_currencies" | "sell_currencies", sign: 1 | -1) {
  return (row: Row, ctx: Ctx) => {
    if (row.payment_method !== "account") return;
    const buy = table === "buy_currencies";
    const d = sign === 1 ? String(row.the_date) : today();
    const ref = `${sign === -1 ? "حذف " : ""}${buy ? "شراء عملة رقم " : "بيع عملة رقم "}${row.the_number ?? row.id}`;
    const post = (currencyId: unknown, amount: unknown, customerOwes: boolean, notes: string) => {
      const amt = Number(amount ?? 0);
      if (!amt || currencyId == null) return;
      applyInsert("customer_transfer_movements", { customer_id: row.customer_id, source_type: table, source_id: row.id, currency_id: Number(currencyId), debit: customerOwes ? amt : 0, credit: customerOwes ? 0 : amt, the_date: d, notes, created_by: ctx.uid }, ctx);
    };
    const forward = sign === 1;
    post(row.currency_id, row.amount, buy ? !forward : forward, ref);
    post(row.exchange_currency_id, row.exchange_amount, buy ? forward : !forward, `مقابل ${ref}`);
    post(row.exchange_currency_id, row.commission, forward, `عمولة ${ref}`);
  };
}

function opsToBoxOpsDelete(table: string) {
  return (row: Row) => removeBoxMovements(table, row.id);
}

function opsToBoxSettlement(row: Row, ctx: Ctx) {
  postBox(row.box_id, row.currency_id, row.amount, row.direction === "paid_to_agent" ? "صرف" : "قبض", `تسوية وكيل رقم ${row.id}`, "agent_settlements", row.id, ctx);
}

function opsToBoxSettlementDelete(row: Row) {
  removeBoxMovements("agent_settlements", row.id);
}

function opsToBoxOutgoingInsert(row: Row, ctx: Ctx) {
  const ref = `حوالة صادرة رقم ${row.transfer_number ?? row.id}`;
  postBox(row.box_id, row.currency_id, row.amount, "قبض", ref, "outgoing_transfers", row.id, ctx);
  postBox(row.box_id, row.commission_currency_id ?? row.currency_id, row.branch_commission, "قبض", `عمولة ${ref}`, "outgoing_transfers", row.id, ctx);
}

function opsToBoxOutgoingUpdate(next: Row, prev: Row, ctx: Ctx) {
  if (next.canceled && !prev.canceled) {
    const ref = `حوالة صادرة رقم ${next.transfer_number ?? next.id}`;
    postBox(next.box_id, next.currency_id, next.amount, "صرف", `إلغاء ${ref}`, "outgoing_transfers", next.id, ctx);
    postBox(next.box_id, next.commission_currency_id ?? next.currency_id, next.branch_commission, "صرف", `رد عمولة ${ref}`, "outgoing_transfers", next.id, ctx);
  }
}

function opsToBoxOutgoingDelete(row: Row) {
  removeBoxMovements("outgoing_transfers", row.id);
}

function opsToBoxIncomingUpdate(next: Row, prev: Row, ctx: Ctx) {
  if (next.delivered && !prev.delivered) {
    postBox(next.box_id, next.currency_id, next.amount, "صرف", `تسليم حوالة واردة رقم ${next.transfer_number ?? next.id}`, "incoming_transfers", next.id, ctx);
  }
}

function opsToBoxIncomingDelete(row: Row) {
  removeBoxMovements("incoming_transfers", row.id);
}

function checkToBoxUpdate(next: Row, prev: Row, ctx: Ctx) {
  if (next.status === "محصل" && prev.status !== "محصل") {
    if (next.box_id == null) throw new RuleError("اختر الصندوق قبل تحصيل الشيك");
    const ref = `تحصيل شيك ${next.check_type} رقم ${next.the_number ?? next.id} (شيك ${next.check_number})`;
    postBox(next.box_id, next.currency_id, next.amount, next.check_type === "وارد" ? "قبض" : "صرف", ref, "checks", next.id, ctx);
  }
}

function checkToBoxDelete(row: Row) {
  removeBoxMovements("checks", row.id);
}

function cashVoucherToBoxInsert(row: Row, ctx: Ctx) {
  const ref = `سند ${row.voucher_type} رقم ${row.the_number ?? row.id}`;
  postBox(row.box_id, row.currency_id, row.amount, row.voucher_type === "صرف" ? "صرف" : "قبض", ref, "cash_vouchers", row.id, ctx);
}

function cashVoucherToBoxDelete(row: Row) {
  removeBoxMovements("cash_vouchers", row.id);
}

function journalVoucherToEntryInsert(row: Row, ctx: Ctx) {
  const entry = applyInsert("entries", { entry_number: row.the_number, the_date: row.the_date, notes: `سند قيد بسيط رقم ${row.the_number ?? row.id}${row.notes ? " — " + String(row.notes).trim() : ""}`, branch_id: row.branch_id ?? null, created_by: ctx.uid }, ctx);
  row.entry_id = entry.id;
  applyInsert("entries_details", { entry_id: entry.id, entry_index: 1, side: "مدين", amount: row.amount, currency_id: row.currency_id, account_id: row.debit_account_id }, ctx);
  applyInsert("entries_details", { entry_id: entry.id, entry_index: 2, side: "دائن", amount: row.amount, currency_id: row.currency_id, account_id: row.credit_account_id }, ctx);
}

function journalVoucherToEntryDelete(row: Row) {
  if (row.entry_id == null) return;
  const entries = tableOf("entries");
  const i = entries.findIndex((e) => String(e.id) === String(row.entry_id));
  if (i >= 0) entries.splice(i, 1);
  const details = tableOf("entries_details");
  for (let k = details.length - 1; k >= 0; k--) if (String(details[k].entry_id) === String(row.entry_id)) details.splice(k, 1);
}

// ---- customer ledger -----------------------------------------------------

function customerMovement(row: Row, ctx: Ctx, side: "debit" | "credit", currencyId: unknown, notes: string, theDate: string) {
  applyInsert("customer_transfer_movements", { customer_id: row.customer_id, source_type: (row as any).__sourceTable ?? "outgoing_transfers", source_id: row.id, currency_id: Number(currencyId), [side]: Number(row.amount), the_date: theDate, notes, created_by: ctx.uid }, ctx);
}

function transferToCustomerOutgoingInsert(row: Row, ctx: Ctx) {
  if (row.payment_method !== "account") return;
  const ref = `حوالة صادرة رقم ${row.transfer_number ?? row.id}`;
  customerMovement({ ...row, amount: row.amount } as Row, { ...ctx, }, "debit", row.currency_id, ref, String(row.the_date));
  if (Number(row.branch_commission) > 0) customerMovement(row as Row, ctx, "debit", row.commission_currency_id ?? row.currency_id, `عمولة ${ref}`, String(row.the_date));
}

function transferToCustomerOutgoingUpdate(next: Row, prev: Row, ctx: Ctx) {
  if (next.payment_method !== "account" || !(next.canceled && !prev.canceled)) return;
  const ref = `حوالة صادرة رقم ${next.transfer_number ?? next.id}`;
  const d = today();
  customerMovement(next as Row, ctx, "credit", next.currency_id, `إلغاء ${ref}`, d);
  if (Number(next.branch_commission) > 0) customerMovement(next as Row, ctx, "credit", next.commission_currency_id ?? next.currency_id, `رد عمولة ${ref}`, d);
}

function transferToCustomerIncomingUpdate(next: Row, prev: Row, ctx: Ctx) {
  if (next.payment_method !== "account" || !(next.delivered && !prev.delivered)) return;
  const ref = `حوالة واردة رقم ${next.transfer_number ?? next.id}`;
  customerMovement(next as Row, ctx, "credit", next.currency_id, `تسليم إلى الحساب ${ref}`, today());
}

// ---- internal transfers --------------------------------------------------

function routeInternalOutgoingInsert(row: Row, ctx: Ctx) {
  if (!row.is_internal) return;
  applyInsert(
    "incoming_transfers",
    {
      internal_outgoing_id: row.id,
      amount: row.amount,
      currency_id: row.currency_id,
      sender_name: row.sender_name,
      sender_phone: row.sender_phone,
      receiver_name: row.receiver_name,
      receiver_phone: row.receiver_phone,
      branch_commission: 0,
      commission_currency_id: row.currency_id,
      the_date: row.the_date,
      state: "معلقة",
      source_name: row.source_name,
      destination_name: "المركز الرئيسي",
      reference_number: row.reference_number,
      transfer_purpose: row.transfer_purpose,
      receiver_identity_type: row.receiver_identity_type,
      receiver_identity_number: row.receiver_identity_number,
      country_id: row.country_id,
      governorate_id: row.governorate_id,
      area_id: row.area_id,
      notes: row.notes,
    },
    ctx,
  );
}

function routeInternalOutgoingUpdate(next: Row, prev: Row) {
  if (next.is_internal && next.canceled && !prev.canceled) {
    const incoming = tableOf("incoming_transfers").find((i) => Number(i.internal_outgoing_id) === Number(next.id) && !i.canceled);
    if (incoming) incoming.canceled = true;
  }
}

function routeInternalIncomingUpdate(next: Row, prev: Row) {
  if (next.internal_outgoing_id != null && next.delivered && !prev.delivered) {
    const outgoing = tableOf("outgoing_transfers").find((o) => Number(o.id) === Number(next.internal_outgoing_id) && !o.delivered);
    if (outgoing) outgoing.delivered = true;
  }
}

// ----------------------------------------------------------------- rpcs

export function runRpc(name: string, args: Record<string, any>, ctx: Ctx): unknown {
  switch (name) {
    case "is_admin":
      return isAdmin(args._user_id ?? ctx.uid, ctx);
    case "has_role":
      return hasRole(args._user_id ?? ctx.uid, args._role, ctx);
    case "has_screen_permission":
      return hasScreenPermission(args.p_screen, args.p_action, ctx);
    case "box_day_summary":
      return boxDaySummary(args.p_date);
    case "create_balanced_entry":
      return createBalancedEntry(args.p_entry_number, args.p_the_date, args.p_notes, args.p_branch_id, args.p_details, ctx);
    case "close_period":
      return closePeriod(args.p_type, args.p_from, args.p_to, ctx);
    default:
      throw new RuleError(`unknown function ${name}`);
  }
}

function boxDaySummary(pDate: string) {
  const groups = new Map<string, { box_id: number; currency_id: number | null; opening: number; receipts: number; payments: number; closing: number }>();
  for (const m of tableOf("box_movements")) {
    const key = `${m.box_id}|${m.currency_id}`;
    if (!groups.has(key)) groups.set(key, { box_id: Number(m.box_id), currency_id: m.currency_id == null ? null : Number(m.currency_id), opening: 0, receipts: 0, payments: 0, closing: 0 });
    const g = groups.get(key)!;
    const day = adenDate(m.created_at);
    const signed = m.movement_type === "صرف" ? -Number(m.amount) : Number(m.amount);
    if (day < pDate) g.opening += signed;
    if (day === pDate && m.movement_type !== "صرف") g.receipts += Number(m.amount);
    if (day === pDate && m.movement_type === "صرف") g.payments += Number(m.amount);
    if (day <= pDate) g.closing += signed;
  }
  return [...groups.values()];
}

function createBalancedEntry(entryNumber: number, theDate: string, notes: string, branchId: number | null, details: Row[], ctx: Ctx): number {
  const debit = details.filter((d) => d.side === "مدين").reduce((s, d) => s + Number(d.amount), 0);
  const credit = details.filter((d) => d.side === "دائن").reduce((s, d) => s + Number(d.amount), 0);
  if (debit <= 0 || debit !== credit) throw new RuleError(`القيد غير متوازن: مدين ${debit} / دائن ${credit}`);
  const entry = applyInsert("entries", { entry_number: entryNumber, the_date: theDate, notes, branch_id: branchId ?? null, created_by: ctx.uid }, ctx);
  details.forEach((d, i) => {
    applyInsert("entries_details", { entry_id: entry.id, entry_index: i + 1, side: d.side, amount: Number(d.amount), currency_id: d.currency_id == null ? null : Number(d.currency_id), account_id: d.account_id == null ? null : Number(d.account_id), notes: d.notes ?? null }, ctx);
  });
  return Number(entry.id);
}

function accountTree(rootNumber: number): number[] {
  const ids: number[] = [];
  const walk = (father: number) => {
    for (const a of tableOf("accounts")) if (Number(a.father_number) === father) {
      ids.push(Number(a.id));
      walk(Number(a.account_number));
    }
  };
  const root = tableOf("accounts").find((a) => Number(a.account_number) === rootNumber && a.father_number == null);
  if (root) {
    ids.push(Number(root.id));
    walk(rootNumber);
  }
  return ids;
}

function closePeriod(type: string, from: string, to: string, ctx: Ctx): number {
  if (!(isAdmin(ctx.uid, ctx) || hasRole(ctx.uid, "manager", ctx))) throw new RuleError("الإقفال المحاسبي للمدير فقط");
  if (!["يومي", "أسبوعي", "شهري", "سنوي"].includes(type)) throw new RuleError("نوع فترة غير صحيح");
  if (from > to) throw new RuleError("بداية الفترة بعد نهايتها");
  if (to > today()) throw new RuleError("لا يمكن إقفال فترة مستقبلية");
  if (tableOf("period_closings").some((p) => String(p.from_date) <= to && String(p.to_date) >= from)) throw new RuleError("توجد فترة مقفلة متداخلة مع هذه الفترة");
  const closing = applyInsert("period_closings", { period_type: type, from_date: from, to_date: to, closed_by: ctx.uid }, ctx);
  const profit = tableOf("accounts").filter((a) => Number(a.father_number) === 3).sort((a, b) => Number(a.account_number) - Number(b.account_number))[0];
  const currencies = [...new Set(tableOf("entries_details").filter((d) => d.currency_id != null && tableOf("entries").some((e) => String(e.id) === String(d.entry_id) && String(e.the_date) >= from && String(e.the_date) <= to)).map((d) => Number(d.currency_id)))];
  let entryId: number | null = null;
  for (const currencyId of currencies) {
    const revenue = new Set(accountTree(4));
    const expense = new Set(accountTree(5));
    const sums = new Map<number, number>();
    for (const d of tableOf("entries_details")) {
      if (Number(d.currency_id) !== currencyId) continue;
      const e = tableOf("entries").find((x) => String(x.id) === String(d.entry_id));
      if (!e || String(e.the_date) < from || String(e.the_date) > to) continue;
      const net = (d.side === "مدين" ? Number(d.amount) : -Number(d.amount)) + (sums.get(Number(d.account_id)) ?? 0);
      sums.set(Number(d.account_id), net);
    }
    const lines: Row[] = [];
    let rev = 0;
    let exp = 0;
    for (const [accountId, net] of sums) {
      if (revenue.has(accountId) && net < 0) {
        rev += -net;
        lines.push({ side: "مدين", amount: -net, currency_id: currencyId, account_id: accountId, notes: "إقفال إيرادات الفترة" });
      }
      if (expense.has(accountId) && net > 0) {
        exp += net;
        lines.push({ side: "دائن", amount: net, currency_id: currencyId, account_id: accountId, notes: "إقفال مصروفات الفترة" });
      }
    }
    const netResult = rev - exp;
    if (profit && (rev > 0 || exp > 0)) {
      lines.push({ side: netResult >= 0 ? "دائن" : "مدين", amount: Math.abs(netResult), currency_id: currencyId, account_id: Number(profit.id), notes: "صافي نتيجة الفترة" });
      entryId = createBalancedEntry(maxNumber("entries", "entry_number") + 1, to, `قيد إقفال ${type} ${from} — ${to}`, null, lines, ctx);
    }
  }
  closing.entry_id = entryId;
  return Number(closing.id);
}

export { saveTables };
