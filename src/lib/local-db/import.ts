// One-time copy of the exchange system's data into the phone database.
// Rows are written as-is (triggers off) so numbers, balances and history stay
// exactly as they were; counters are then moved past the imported rows.
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { STAFF_EMAIL_DOMAIN } from "@/lib/username";
import { flushToDisk, setMeta } from "./engine";

export type SeedFile = { format: "abu-elyas-seed" | "al-sarafa-snapshot"; version: number; created_at: string; tables: Record<string, Record<string, unknown>[]> };

/** Tables the phone never takes from the cloud: sessions, licensing and test leftovers. */
export const SKIP_TABLES = new Set(["staff_session_locks", "admin_setup_claim", "installation_license", "activation_codes", "platform_owners", "zz_probe", "profiles_probe_x", "local_meta", "local_files"]);

export function parseSeed(text: string): SeedFile {
  let s: SeedFile;
  try { s = JSON.parse(text); } catch { throw new Error("الملف ليس نسخة صالحة"); }
  if (!s || (s.format !== "abu-elyas-seed" && s.format !== "al-sarafa-snapshot") || typeof s.tables !== "object") throw new Error("الملف ليس نسخة من نظام الصرافة");
  return s;
}

async function insertTable(tx: Transaction, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  const cols = await tx.query<{ c: string; gen: string; ident: string }>(
    "select a.attname c, a.attgenerated gen, a.attidentity ident from pg_attribute a where a.attrelid = ('public.' || quote_ident($1))::regclass and a.attnum > 0 and not a.attisdropped",
    [table],
  );
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  const usable = cols.rows.filter((c) => c.gen === "" && keys.has(c.c));
  if (usable.length === 0) return 0;
  const list = usable.map((c) => `"${c.c}"`).join(", ");
  const overriding = usable.some((c) => c.ident === "a") ? " OVERRIDING SYSTEM VALUE" : "";
  for (let i = 0; i < rows.length; i += 500) {
    await tx.query(`insert into public."${table}" (${list})${overriding} select ${list} from json_populate_recordset(null::public."${table}", $1::json)`, [JSON.stringify(rows.slice(i, i + 500))]);
  }
  return rows.length;
}

/** Counters: every sequence/identity column continues after the highest imported value. */
async function bumpSequences(tx: Transaction) {
  const seqs = await tx.query<{ tab: string; col: string; seq: string }>(
    `select c.relname tab, a.attname col, pg_get_serial_sequence('public.' || quote_ident(c.relname), a.attname) seq
       from pg_class c join pg_attribute a on a.attrelid = c.oid
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and pg_get_serial_sequence('public.' || quote_ident(c.relname), a.attname) is not null`,
  );
  for (const s of seqs.rows) {
    await tx.query(`select setval($1, greatest(coalesce((select max("${s.col}") from public."${s.tab}"), 0), 1), (select count(*) > 0 from public."${s.tab}"))`, [s.seq]);
  }
}

export async function importSeed(pg: PGlite, seed: SeedFile): Promise<{ tables: number; rows: number }> {
  let total = 0, tables = 0;
  await pg.transaction(async (tx) => {
    const existing = await tx.query<{ n: number }>("select (select count(*) from public.accounts) + (select count(*) from public.customers) as n");
    if (Number(existing.rows[0]?.n) > 0) throw new Error("يوجد بيانات على الهاتف مسبقًا؛ الاستيراد يتم مرة واحدة فقط");
    await tx.exec("SET LOCAL session_replication_role = replica");
    const names = await tx.query<{ t: string }>("select relname t from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'");
    const known = new Set(names.rows.map((r) => r.t));
    // Accounts referenced by profiles/user_roles need sign-in rows; passwords are set on the phone.
    const profiles = (seed.tables["profiles"] ?? []) as { id: string; username?: string | null; full_name?: string }[];
    for (const p of profiles) {
      const email = p.username ? `${String(p.username).trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}` : `${p.id}@${STAFF_EMAIL_DOMAIN}`;
      await tx.query("insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3::jsonb) on conflict do nothing", [p.id, email, JSON.stringify({ full_name: p.full_name ?? "", username: p.username ?? "" })]);
    }
    for (const r of (seed.tables["user_roles"] ?? []) as { user_id: string }[]) {
      await tx.query("insert into auth.users(id, email) values ($1, $2) on conflict do nothing", [r.user_id, `${r.user_id}@${STAFF_EMAIL_DOMAIN}`]);
    }
    for (const [table, rows] of Object.entries(seed.tables)) {
      if (SKIP_TABLES.has(table) || !known.has(table) || !Array.isArray(rows)) continue;
      // Cloud-only defaults (e.g. the signup profile) must not collide with imported rows.
      if (table === "profiles") await tx.query("delete from public.profiles where id = any($1::uuid[])", [rows.map((r) => r["id"])]);
      total += await insertTable(tx, table, rows);
      tables++;
    }
    await bumpSequences(tx);
    await tx.exec("SET LOCAL session_replication_role = origin");
  });
  await setMeta(pg, "imported", { at: new Date().toISOString(), source_created_at: seed.created_at, format: seed.format, rows: total });
  await flushToDisk(pg);
  return { tables, rows: total };
}
