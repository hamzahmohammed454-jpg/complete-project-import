// Import of a «هولجن» (Hologram Soft) Android backup (.db, SQLite) into the
// «أبو الياس» phone database. Every Holgen voucher becomes one journal entry
// with its original lines (negative amount = مدين, positive = دائن), so each
// account's statement and balance match Holgen exactly. Rows are written with
// triggers off: Holgen already posted these effects, nothing is re-posted.
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { flushToDisk, setMeta } from "./engine";

type Row = Record<string, unknown>;

export type HolgenData = {
  currencies: { id: number; name: string; price: number }[];
  groups: { id: number; name: string }[];
  accounts: { id: number; name: string; type: number; phone: string; groupId: number | null; note: string }[];
  entries: { id: number; doc: number; docType: string; date: string; note: string; time: string }[];
  lines: { entry: number; amount: number; currency: number; account: number; note: string }[];
  receivers: { name: string; phone: string }[];
};

/** Holgen account types → parent in our chart (number, name, father). */
export const TYPE_PARENT: Record<number, number> = { 1: 32, 2: 11, 3: 14, 4: 14, 5: 13, 6: 31, 7: 43, 8: 55, 9: 33 };
const PARENTS: [number, string, number | null][] = [
  [1, "الأصول", null], [2, "الخصوم", null], [3, "حقوق الملكية", null], [4, "الإيرادات", null], [5, "المصروفات", null],
  [11, "النقدية والصناديق", 1], [13, "الوكلاء والمراسلون", 1], [14, "العملاء", 1],
  [31, "رأس المال", 3], [32, "الأرباح والخسائر المرحلة", 3], [33, "حسابات هولجن الأخرى", 3],
  [43, "إيرادات هولجن", 4], [55, "مصروفات هولجن", 5],
];

const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export async function readHolgen(bytes: Uint8Array): Promise<HolgenData> {
  const initSqlJs = (await import("sql.js")).default;
  const browser = typeof window !== "undefined";
  const wasmUrl = browser ? new URL("wasm/sql-wasm.bin", document.baseURI).href : undefined;
  const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  const db = new SQL.Database(bytes);
  try {
    const all = (sql: string): Row[] => {
      const r = db.exec(sql)[0];
      return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : [];
    };
    const names = new Set(all("select name from sqlite_master where type='table'").map((r) => String(r["name"])));
    for (const t of ["currencies", "accounts", "entries", "entries_details"]) if (!names.has(t)) throw new Error("الملف ليس نسخة من نظام هولجن");
    return {
      currencies: all("select id, name, price from currencies order by id").map((r) => ({ id: num(r["id"]), name: str(r["name"]), price: num(r["price"]) })),
      groups: names.has("accounts_groups") ? all("select id, name from accounts_groups order by id").map((r) => ({ id: num(r["id"]), name: str(r["name"]) })) : [],
      accounts: all("select id, name, accountType, phone, groupId, note from accounts order by id").map((r) => ({ id: num(r["id"]), name: str(r["name"]) || `حساب ${r["id"]}`, type: num(r["accountType"]), phone: str(r["phone"]), groupId: r["groupId"] == null ? null : num(r["groupId"]), note: str(r["note"]) })),
      entries: all("select id, doc, docType, date, note, entryTime from entries order by id").map((r) => ({ id: num(r["id"]), doc: num(r["doc"]), docType: str(r["docType"]), date: str(r["date"]).slice(0, 10), note: str(r["note"]), time: str(r["entryTime"]) })),
      lines: all("select entry, amount, currency, account, note from entries_details order by id").map((r) => ({ entry: num(r["entry"]), amount: num(r["amount"]), currency: num(r["currency"]), account: num(r["account"]), note: str(r["note"]) })),
      receivers: names.has("receivers") ? all("select name, phone from receivers order by id").map((r) => ({ name: str(r["name"]), phone: str(r["phone"]) })).filter((r) => r.name) : [],
    };
  } finally {
    db.close();
  }
}

/** Per account and currency: positive = مدين. Used for checks and tests. */
export function holgenBalances(d: HolgenData): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of d.lines) {
    if (Math.abs(l.amount) < 1e-9) continue;
    const k = `${l.account}|${l.currency}`;
    out.set(k, (out.get(k) ?? 0) - l.amount);
  }
  return out;
}

async function next(tx: Transaction, sql: string): Promise<number> {
  const r = await tx.query<{ n: string | number }>(sql);
  return Number(r.rows[0]?.n ?? 0) + 1;
}

export type HolgenResult = { accounts: number; customers: number; entries: number; lines: number; receivers: number; currencies: number };

export async function importHolgen(pg: PGlite, d: HolgenData): Promise<HolgenResult> {
  const res: HolgenResult = { accounts: 0, customers: 0, entries: 0, lines: 0, receivers: 0, currencies: 0 };
  await pg.transaction(async (tx) => {
    const done = await tx.query("select 1 from public.entries where posting_source = 'holgen' limit 1");
    if (done.rows.length) throw new Error("بيانات هولجن مستوردة مسبقًا على هذا الهاتف");
    await tx.exec("SET LOCAL session_replication_role = replica");

    // Chart parents (created only when missing).
    const acc = new Map<number, number>(); // account_number → id
    for (const r of (await tx.query<{ id: number; account_number: number }>("select id, account_number from public.accounts")).rows) acc.set(Number(r.account_number), Number(r.id));
    for (const [n, name, father] of PARENTS) {
      if (acc.has(n)) continue;
      const r = await tx.query<{ id: number }>("insert into public.accounts(account_number, father_number, account_name, account_type) values ($1, $2, $3, 'رئيسي') returning id", [n, father, name]);
      acc.set(n, Number(r.rows[0]!.id));
    }

    // Currencies: matched by name, else added with the next number.
    const curMap = new Map<number, number>();
    const existingCur = (await tx.query<{ id: number; currency_name: string }>("select id, currency_name from public.currencies")).rows;
    for (const c of d.currencies) {
      const hit = existingCur.find((x) => x.currency_name.trim() === c.name);
      if (hit) { curMap.set(c.id, Number(hit.id)); continue; }
      const n = await next(tx, "select coalesce(max(the_number), 0) n from public.currencies");
      const r = await tx.query<{ id: number }>("insert into public.currencies(the_number, currency_name, notes) values ($1, $2, $3) returning id", [n, c.name, `من هولجن — السعر ${c.price}`]);
      curMap.set(c.id, Number(r.rows[0]!.id));
      res.currencies++;
    }

    // Groups.
    const grpMap = new Map<number, number>();
    for (const g of d.groups) {
      const hit = await tx.query<{ id: number }>("select id from public.account_groups where group_name = $1", [g.name]);
      if (hit.rows[0]) { grpMap.set(g.id, Number(hit.rows[0].id)); continue; }
      const n = await next(tx, "select coalesce(max(the_number), 0) n from public.account_groups");
      const r = await tx.query<{ id: number }>("insert into public.account_groups(the_number, group_name, notes) values ($1, $2, 'من هولجن') returning id", [n, g.name]);
      grpMap.set(g.id, Number(r.rows[0]!.id));
    }

    // Accounts (+ customer card for عملاء / تجار).
    const accMap = new Map<number, number>();
    const usedPhones = new Set((await tx.query<{ p: string }>("select phone_number p from public.customers where phone_number is not null")).rows.map((r) => r.p));
    const referenced = new Set(d.lines.map((l) => l.account));
    for (const a of d.accounts) {
      const father = TYPE_PARENT[a.type] ?? 33;
      const n = await next(tx, `select greatest(coalesce(max(account_number), 0), ${father * 100}) n from public.accounts where father_number = ${father}`);
      const r = await tx.query<{ id: number }>(
        "insert into public.accounts(account_number, father_number, account_name, account_type, account_reference, group_id) values ($1, $2, $3, 'فرعي', $4, $5) returning id",
        [n, father, a.name, `هولجن ${a.id}`, a.groupId != null ? grpMap.get(a.groupId) ?? null : null],
      );
      const id = Number(r.rows[0]!.id);
      accMap.set(a.id, id);
      res.accounts++;
      if (a.type === 3 || a.type === 4) {
        const phone = a.phone && !usedPhones.has(a.phone) ? a.phone : null;
        if (phone) usedPhones.add(phone);
        const u = await next(tx, "select coalesce(max(the_user_id), 0) n from public.customers");
        await tx.query("insert into public.customers(the_user_id, account_id, full_name, phone_number) values ($1, $2, $3, $4)", [u, id, a.name, phone]);
        res.customers++;
      }
    }
    for (const id of referenced) if (!accMap.has(id)) {
      const n = await next(tx, "select greatest(coalesce(max(account_number), 0), 3300) n from public.accounts where father_number = 33");
      const r = await tx.query<{ id: number }>("insert into public.accounts(account_number, father_number, account_name, account_type, account_reference) values ($1, 33, $2, 'فرعي', $3) returning id", [n, `حساب هولجن محذوف ${id}`, `هولجن ${id}`]);
      accMap.set(id, Number(r.rows[0]!.id));
    }

    // Entries and their lines.
    const byEntry = new Map<number, HolgenData["lines"]>();
    for (const l of d.lines) { const list = byEntry.get(l.entry) ?? []; list.push(l); byEntry.set(l.entry, list); }
    let entryNo = await next(tx, "select coalesce(max(entry_number), 0) n from public.entries");
    for (const e of d.entries) {
      const lines = (byEntry.get(e.id) ?? []).filter((l) => Math.abs(l.amount) > 1e-9);
      if (!lines.length) continue;
      const created = /^\d{4}-\d{2}-\d{2}/.test(e.time) ? `${e.time.replace(" ", "T")}+03:00` : `${e.date}T12:00:00+03:00`;
      const r = await tx.query<{ id: number }>(
        "insert into public.entries(entry_number, the_date, notes, debited, created_at, posting_source, posting_source_id, created_by) values ($1, $2::date, $3, true, $4::timestamptz, 'holgen', $5, null) returning id",
        [entryNo++, e.date || "2024-01-01", `${e.docType} رقم ${e.doc}${e.note ? ` — ${e.note}` : ""}`, created, e.id],
      );
      const eid = Number(r.rows[0]!.id);
      let idx = 1;
      for (const l of lines) {
        await tx.query("insert into public.entries_details(entry_id, entry_index, side, amount, currency_id, account_id, notes) values ($1, $2, $3, $4, $5, $6, $7)", [eid, idx++, l.amount < 0 ? "مدين" : "دائن", Math.abs(l.amount), curMap.get(l.currency) ?? null, accMap.get(l.account) ?? null, l.note || null]);
        res.lines++;
      }
      res.entries++;
    }

    // Receivers become receiver cards.
    let card = await next(tx, "select coalesce(max(the_number), 0) n from public.receiver_cards");
    for (const v of d.receivers) {
      await tx.query("insert into public.receiver_cards(the_number, full_name, phone_number, notes) values ($1, $2, $3, 'من هولجن')", [card++, v.name, v.phone || null]);
      res.receivers++;
    }
    await tx.exec("SET LOCAL session_replication_role = origin");
  });
  await setMeta(pg, "holgen_imported", { at: new Date().toISOString(), ...res });
  await flushToDisk(pg);
  return res;
}
