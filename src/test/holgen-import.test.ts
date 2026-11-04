// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { openLocalDb, type LocalDb } from "@/lib/local-db/engine";
import { holgenBalances, importHolgen, readHolgen } from "@/lib/local-db/holgen";
import { rolloverYear } from "@/lib/local-db/maintenance";

let db: LocalDb;

async function sampleHolgen() {
  const SQL = await initSqlJs();
  const s = new SQL.Database();
  s.run(`create table currencies(id integer primary key, name text, price float);
    create table accounts_groups(id integer primary key, name text);
    create table accounts(id integer primary key, name text, accountType integer, phone text, address text, note text, role integer, title text, notify integer, groupId integer);
    create table entries(id integer primary key, doc integer, docType text, date text, note text, user integer, entryTime text, isDepend integer);
    create table entries_details(id integer primary key, entry integer, amount float, currency integer, mcAmount float, account integer, note text);
    create table receivers(id integer primary key, name text, phone text);
    insert into currencies values (1,'ريال يمني',1),(3,'دولار امريكي',528.5);
    insert into accounts_groups values (1,'المجموعة الافتراضيه');
    insert into accounts values (5,'صندوق حمزة',2,'','','',1,'',0,1),(13,'علي الحرازي',3,'777','','',1,'',0,1),(29,'الاهلاكات',8,'','','',1,'',0,1);
    insert into entries values (1,1,'سند قبض','2025-03-01','',1,'2025-03-01 10:00:00',1),(2,1,'سند صرف','2025-04-01','بترول',1,'2025-04-01 10:00:00',1),(3,2,'سند قبض','2025-05-01','',1,'2025-05-01 10:00:00',1);
    insert into entries_details values (1,1,-10000,1,-10000,5,'قبض'),(2,1,10000,1,10000,13,'له'),(3,2,-19000,1,-19000,29,'بترول'),(4,2,19000,1,19000,5,''),(5,3,-50,3,-50,5,''),(6,3,50,3,50,13,'');
    insert into receivers values (1,'محمد','771');`);
  const bytes = s.export();
  s.close();
  return bytes;
}

beforeAll(async () => { db = await openLocalDb("memory://"); }, 120_000);

describe("Holgen import and new-year rollover", () => {
  it("imports every voucher with matching balances (negative amount = مدين)", async () => {
    const data = await readHolgen(await sampleHolgen());
    expect(holgenBalances(data).get("13|1")).toBe(-10000);
    const r = await importHolgen(db.pg, data);
    expect(r).toMatchObject({ accounts: 3, customers: 1, entries: 3, lines: 6, receivers: 1 });
    const bal = await db.pg.query<{ account_name: string; net: string }>(`select a.account_name, sum(case when d.side='مدين' then d.amount else -d.amount end) net
      from public.entries_details d join public.accounts a on a.id=d.account_id join public.currencies c on c.id=d.currency_id where c.currency_name='ريال يمني' group by 1`);
    const m = Object.fromEntries(bal.rows.map((x) => [x.account_name, Number(x.net)]));
    expect(m).toEqual({ "صندوق حمزة": -9000, "علي الحرازي": -10000, "الاهلاكات": 19000 });
    await expect(importHolgen(db.pg, data)).rejects.toThrow("مستوردة مسبقًا");
  });

  it("rollover keeps accounts and carries each balance into one opening entry", async () => {
    const before = await db.pg.query<{ n: number }>("select count(*)::int n from public.accounts");
    const r = await rolloverYear(db.pg, "2026-01-01");
    expect(r.until).toBe("2025-12-31");
    const entries = await db.pg.query<{ n: number }>("select count(*)::int n from public.entries");
    expect(entries.rows[0]?.n).toBe(1);
    const after = await db.pg.query<{ n: number }>("select count(*)::int n from public.accounts");
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    const lines = await db.pg.query<{ account_name: string; side: string; amount: string; cur: string }>(`select a.account_name, d.side, d.amount, c.currency_name cur from public.entries_details d join public.accounts a on a.id=d.account_id join public.currencies c on c.id=d.currency_id`);
    const find = (n: string, cur: string) => lines.rows.find((l) => l.account_name === n && l.cur === cur);
    expect(find("علي الحرازي", "ريال يمني")).toMatchObject({ side: "دائن", amount: "10000.0000" });
    expect(find("علي الحرازي", "دولار امريكي")).toMatchObject({ side: "دائن", amount: "50.0000" });
    expect(find("صندوق حمزة", "ريال يمني")).toMatchObject({ side: "دائن", amount: "9000.0000" });
    // Expenses close into retained earnings, not carried on the expense account.
    expect(find("الاهلاكات", "ريال يمني")).toBeUndefined();
    expect(find("الأرباح والخسائر المرحلة", "ريال يمني")).toMatchObject({ side: "مدين", amount: "19000.0000" });
    const perCur = await db.pg.query<{ s: string }>("select sum(case when side='مدين' then amount else -amount end) s from public.entries_details group by currency_id");
    for (const x of perCur.rows) expect(Number(x.s)).toBe(0);
  });
});
