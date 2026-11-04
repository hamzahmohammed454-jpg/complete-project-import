// Phone-database maintenance for «أبو الياس»: full backup, restore and the
// new-year rollover (a fresh database that keeps the master data and starts
// from one opening-balance entry). All of it runs on the phone only.
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { partyNetBalances, type AllAccountsInput } from "@/lib/all-accounts";
import { flushToDisk, setMeta } from "./engine";
import { importSeed, SKIP_TABLES, type SeedFile } from "./import";

export type LocalBackup = SeedFile & { auth_users?: Record<string, unknown>[] };

async function tableNames(q: Pick<PGlite, "query">) {
  const r = await q.query<{ t: string }>("select relname t from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname");
  return r.rows.map((x) => x.t).filter((t) => !SKIP_TABLES.has(t));
}

/** Every table, with sign-ins (password hashes) so a restore keeps the same logins. */
export async function exportLocal(pg: PGlite): Promise<LocalBackup> {
  const tables: LocalBackup["tables"] = {};
  for (const t of await tableNames(pg)) {
    const r = await pg.query<{ j: Record<string, unknown>[] | null }>(`select json_agg(x) j from public."${t}" x`);
    tables[t] = r.rows[0]?.j ?? [];
  }
  const users = await pg.query<{ j: Record<string, unknown>[] | null }>("select json_agg(u) j from auth.users u");
  return { format: "abu-elyas-seed", version: 1, created_at: new Date().toISOString(), tables, auth_users: users.rows[0]?.j ?? [] };
}

async function wipe(tx: Transaction, tables: string[]) {
  if (!tables.length) return;
  await tx.exec(`truncate ${tables.map((t) => `public."${t}"`).join(", ")} restart identity cascade`);
}

/** Replaces everything on the phone with a backup taken from this app. */
export async function restoreLocal(pg: PGlite, backup: LocalBackup) {
  await pg.transaction(async (tx) => {
    await tx.exec("SET LOCAL session_replication_role = replica");
    await wipe(tx, await tableNames(tx));
    await tx.exec("delete from auth.users");
    for (const u of backup.auth_users ?? []) {
      await tx.query("insert into auth.users select * from json_populate_record(null::auth.users, $1::json) on conflict do nothing", [JSON.stringify(u)]);
    }
  });
  const r = await importSeed(pg, backup);
  await setMeta(pg, "imported", { at: new Date().toISOString(), restored_from: backup.created_at });
  await flushToDisk(pg);
  return r;
}

/** Operations, logs and closings: removed by the rollover. Everything else is master data and stays. */
export const ROLLOVER_CLEARS = [
  "activity_log", "agent_settlements", "box_closings", "box_movements", "buy_currencies", "sell_currencies", "cash_vouchers",
  "checks", "customer_transfer_movements", "entries_details", "entries", "funds_inventory_details", "funds_inventory",
  "inventory_postings", "incoming_transfers", "outgoing_transfers", "journal_vouchers", "loop_entries_runs", "period_closings",
  "transfer_requests", "withdrawal_requests",
] as const;

export type OpeningLine = { account_id: number; currency_id: number; net: number };

/**
 * Opening lines as of `until`: customers/agents as the all-accounts report sees them,
 * every other account from its journal lines. Revenue/expense close into retained
 * earnings (32); each currency is balanced against capital (31). Positive = مدين.
 */
export function openingLines(
  input: AllAccountsInput,
  accounts: { id: number; account_number: number; father_number: number | null }[],
  until: string,
  retainedId: number,
  capitalId: number,
): OpeningLine[] {
  const partyAccounts = new Set<number>();
  for (const p of [...input.customers, ...input.agents]) if (p.account_id != null) partyAccounts.add(p.account_id);
  const byNumber = new Map(accounts.map((a) => [a.account_number, a]));
  const rootOf = (id: number) => {
    let a = accounts.find((x) => x.id === id);
    for (let i = 0; a && a.father_number != null && i < 20; i++) a = byNumber.get(a.father_number);
    return a?.account_number ?? 0;
  };
  const sums = new Map<string, number>();
  const add = (acc: number, cur: number, v: number) => { const k = `${acc}|${cur}`; sums.set(k, (sums.get(k) ?? 0) + v); };
  for (const p of partyNetBalances(input, "", until)) {
    const party = (p.kind === "customer" ? input.customers : input.agents).find((x) => x.id === p.id);
    if (party?.account_id != null) add(party.account_id, p.currency_id, p.net);
  }
  for (const e of input.entries) {
    if (e.account_id == null || e.currency_id == null || e.the_date > until || partyAccounts.has(e.account_id)) continue;
    const v = e.side === "مدين" ? Number(e.amount) : -Number(e.amount);
    const root = rootOf(e.account_id);
    add(root === 4 || root === 5 ? retainedId : e.account_id, e.currency_id, v);
  }
  const lines: OpeningLine[] = [];
  const perCur = new Map<number, number>();
  for (const [k, net] of sums) {
    const r = Math.round(net * 10000) / 10000;
    if (Math.abs(r) < 0.0001) continue;
    const [a, c] = k.split("|").map(Number) as [number, number];
    lines.push({ account_id: a, currency_id: c, net: r });
    perCur.set(c, (perCur.get(c) ?? 0) + r);
  }
  for (const [c, total] of perCur) {
    const r = Math.round(total * 10000) / 10000;
    if (Math.abs(r) >= 0.0001) lines.push({ account_id: capitalId, currency_id: c, net: -r });
  }
  return lines;
}

async function rows<T>(tx: Pick<PGlite, "query">, sql: string): Promise<T[]> { return (await tx.query<T>(sql)).rows; }

/** Starts a new year: keeps master data, clears operations, posts one opening entry dated `openingDate`. */
export async function rolloverYear(pg: PGlite, openingDate: string) {
  const until = new Date(new Date(`${openingDate}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  let posted = 0;
  await pg.transaction(async (tx) => {
    await tx.exec("SET LOCAL session_replication_role = replica");
    const input: AllAccountsInput = {
      customers: (await rows<{ id: number; full_name: string; the_user_id: number; account_id: number | null }>(tx, "select id, full_name, the_user_id, account_id from public.customers")).map((c) => ({ kind: "customer", id: Number(c.id), name: c.full_name, num: c.the_user_id, account_id: c.account_id == null ? null : Number(c.account_id) })),
      agents: (await rows<{ id: number; agent_name: string; the_number: number; account_id: number | null }>(tx, "select id, agent_name, the_number, account_id from public.agents")).map((a) => ({ kind: "agent", id: Number(a.id), name: a.agent_name, num: a.the_number, account_id: a.account_id == null ? null : Number(a.account_id) })),
      vouchers: await rows(tx, "select customer_id, voucher_type, amount, currency_id, the_date::text the_date from public.cash_vouchers where customer_id is not null"),
      checks: await rows(tx, "select customer_id, check_type, status, amount, currency_id, the_date::text the_date, collected_date::text collected_date from public.checks where customer_id is not null"),
      outgoing: await rows(tx, "select agent_id, amount, currency_id, the_date::text the_date, canceled from public.outgoing_transfers where agent_id is not null"),
      incoming: await rows(tx, "select agent_id, amount, currency_id, the_date::text the_date, canceled from public.incoming_transfers where agent_id is not null"),
      settlements: await rows(tx, "select agent_id, amount, currency_id, direction, the_date::text the_date from public.agent_settlements"),
      entries: await rows(tx, "select d.account_id, d.side, d.amount, d.currency_id, e.the_date::text the_date from public.entries_details d join public.entries e on e.id = d.entry_id where not d.settlement_mirror"),
      transferMovements: await rows(tx, "select customer_id, currency_id, debit, credit, the_date::text the_date from public.customer_transfer_movements"),
    };
    const accounts = (await rows<{ id: number; account_number: number; father_number: number | null }>(tx, "select id, account_number, father_number from public.accounts")).map((a) => ({ id: Number(a.id), account_number: Number(a.account_number), father_number: a.father_number == null ? null : Number(a.father_number) }));
    const ensure = async (n: number, name: string, father: number) => {
      const hit = accounts.find((a) => a.account_number === n);
      if (hit) return hit.id;
      const r = await tx.query<{ id: number }>("insert into public.accounts(account_number, father_number, account_name, account_type) values ($1, $2, $3, 'رئيسي') returning id", [n, father, name]);
      return Number(r.rows[0]!.id);
    };
    await ensure(3, "حقوق الملكية", null as unknown as number);
    const retained = await ensure(32, "الأرباح والخسائر المرحلة", 3);
    const capital = await ensure(31, "رأس المال", 3);
    const lines = openingLines(input, accounts, until, retained, capital);
    // Box cash as the box screens see it (box_movements), carried as one movement per currency.
    const boxes = await rows<{ box_id: number; currency_id: number; net: string }>(tx, "select box_id, currency_id, sum(case when movement_type in ('صرف','سحب') then -amount else amount end) net from public.box_movements where created_at::date <= '" + until + "' group by 1, 2");

    await wipe(tx, [...ROLLOVER_CLEARS]);
    const e = await tx.query<{ id: number }>("insert into public.entries(entry_number, the_date, notes, posting_source, created_by) values (1, $1::date, $2, 'opening', null) returning id", [openingDate, `قيد افتتاحي — أرصدة حتى ${until}`]);
    const eid = Number(e.rows[0]!.id);
    let idx = 1;
    for (const l of lines) {
      await tx.query("insert into public.entries_details(entry_id, entry_index, side, amount, currency_id, account_id, notes) values ($1, $2, $3, $4, $5, $6, 'رصيد افتتاحي')", [eid, idx++, l.net > 0 ? "مدين" : "دائن", Math.abs(l.net), l.currency_id, l.account_id]);
      posted++;
    }
    for (const b of boxes) {
      const v = Number(b.net);
      if (Math.abs(v) < 0.0001) continue;
      await tx.query("insert into public.box_movements(box_id, currency_id, amount, movement_type, notes, created_at, source_type) values ($1, $2, $3, $4, 'رصيد افتتاحي', $5::timestamptz, 'opening')", [b.box_id, b.currency_id, Math.abs(v), v > 0 ? "قبض" : "صرف", `${openingDate}T00:00:00+03:00`]);
    }
    await tx.exec("SET LOCAL session_replication_role = origin");
  });
  await setMeta(pg, "rollover", { at: new Date().toISOString(), opening_date: openingDate, lines: posted });
  await flushToDisk(pg);
  return { lines: posted, until };
}
