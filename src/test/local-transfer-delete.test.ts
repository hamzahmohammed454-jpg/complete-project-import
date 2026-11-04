// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { openLocalDb, type LocalDb } from "@/lib/local-db/engine";
import { errorResponse, handleRest } from "@/lib/local-db/postgrest";

let db: LocalDb;
const ADMIN = "11111111-1111-4111-8111-111111111111";

async function rest(method: string, pathAndQuery: string, body?: unknown, headers: Record<string, string> = {}) {
  const [path = "", search = ""] = pathAndQuery.split("?");
  return db.pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
    try {
      const r = await handleRest(tx as never, db.catalog, { method, path, search, headers: new Headers(headers), body: body === undefined ? null : JSON.stringify(body) });
      return { status: r.status, data: r.body ? JSON.parse(r.body) : null };
    } catch (e) {
      const r = errorResponse(e);
      return { status: r.status, data: JSON.parse(r.body!) };
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

describe("phone app: deleting a saved outgoing transfer", () => {
  it("removes a pending cash outgoing transfer and its box movement", async () => {
    const cur = await rest("POST", "currencies?select=id", { the_number: 0, currency_name: "ريال", iso_code: "YER" }, { prefer: "return=representation" });
    expect(cur.status, JSON.stringify(cur.data)).toBe(201);
    const box = await rest("POST", "boxes?select=id", { the_number: 0, box_name: "الصندوق" }, { prefer: "return=representation" });
    expect(box.status, JSON.stringify(box.data)).toBe(201);
    const agent = await rest("POST", "agents?select=id", { the_number: 0, agent_name: "وكيل" }, { prefer: "return=representation" });
    expect(agent.status, JSON.stringify(agent.data)).toBe(201);
    const t = await rest("POST", "outgoing_transfers?select=id", {
      amount: 1000, currency_id: cur.data[0].id, box_id: box.data[0].id, agent_id: agent.data[0].id,
      sender_name: "مرسل", receiver_name: "مستلم", payment_method: "cash", branch_commission: 0,
    }, { prefer: "return=representation" });
    expect(t.status, JSON.stringify(t.data)).toBe(201);
    const id = t.data[0].id;
    const del = await rest("POST", "rpc/delete_outgoing_transfer", { p_id: id });
    expect(del.status, JSON.stringify(del.data)).toBeLessThan(300);
    const left = await db.pg.query<{ n: number }>("select count(*)::int n from public.outgoing_transfers where id=$1", [id]);
    expect(left.rows[0]?.n).toBe(0);
    const moves = await db.pg.query<{ n: number }>("select count(*)::int n from public.box_movements where source_type='outgoing_transfers' and source_id=$1", [id]);
    expect(moves.rows[0]?.n).toBe(0);
  });
});
