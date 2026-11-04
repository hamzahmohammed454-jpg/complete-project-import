// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { openLocalDb, type LocalDb } from "@/lib/local-db/engine";
import { errorResponse, handleRest, parseSelect } from "@/lib/local-db/postgrest";

let db: LocalDb;
const ADMIN = "11111111-1111-4111-8111-111111111111";

async function rest(method: string, pathAndQuery: string, body?: unknown, headers: Record<string, string> = {}) {
  const [path = "", search = ""] = pathAndQuery.split("?");
  return db.pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
    try {
      const r = await handleRest(tx as never, db.catalog, { method, path, search, headers: new Headers(headers), body: body === undefined ? null : JSON.stringify(body) });
      return { status: r.status, data: r.body ? JSON.parse(r.body) : null, headers: r.headers };
    } catch (e) {
      const r = errorResponse(e);
      return { status: r.status, data: JSON.parse(r.body!), headers: r.headers };
    }
  });
}

beforeAll(async () => {
  db = await openLocalDb("memory://");
  await db.pg.exec(`
    insert into auth.users(id, email) values ('${ADMIN}', 'admin@local');
    insert into public.profiles(id, full_name, username) values ('${ADMIN}', 'المدير', 'admin') on conflict (id) do nothing;
    insert into public.user_roles(user_id, role) values ('${ADMIN}', 'admin');
  `);
}, 120_000);

describe("local database", () => {
  it("loads the full cloud schema with its rules", async () => {
    const r = await db.pg.query<{ n: number }>("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal");
    expect(r.rows[0]?.n).toBeGreaterThan(150);
  });

  it("parses embedded selects with aliases and hints", () => {
    const items = parseSelect("id, debit_account:accounts!debit_account_id(account_name), entries!inner(the_date)");
    expect(items[1]).toMatchObject({ kind: "embed", rel: "accounts", alias: "debit_account", hint: "debit_account_id" });
    expect(items[2]).toMatchObject({ kind: "embed", rel: "entries", inner: true });
  });

  it("creates a currency and reads it back like the cloud", async () => {
    const ins = await rest("POST", "currencies?select=*", { the_number: 0, currency_name: "ريال يمني", iso_code: "YER" }, { prefer: "return=representation" });
    expect(ins.status, JSON.stringify(ins.data)).toBe(201);
    expect(ins.data[0].currency_name).toBe("ريال يمني");
    const list = await rest("GET", "currencies?select=id,currency_name&currency_name=eq.ريال يمني", undefined, { prefer: "count=exact" });
    expect(list.data).toHaveLength(1);
    expect(list.headers["content-range"]).toBe("0-0/1");
  });
});
