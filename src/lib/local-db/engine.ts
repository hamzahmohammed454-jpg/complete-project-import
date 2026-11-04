// The on-device PostgreSQL for the offline "أبو الياس" app. It runs the exact
// cloud schema (tables, numbering and posting triggers) inside the phone.
import type { PGlite } from "@electric-sql/pglite";
import prelude from "./prelude.sql?raw";
import schema from "./schema.sql?raw";
import overrides from "./overrides.sql?raw";
import upgrade2 from "./upgrade-2.sql?raw";
import { loadCatalog, type Catalog, type SqlRunner } from "./postgrest";

export const LOCAL_SCHEMA_VERSION = 2;
/** Rule changes for phones installed on an older schema, keyed by the version they bring the database to. */
const UPGRADES: [number, string][] = [[2, upgrade2]];
export const LOCAL_DB_NAME = "abu-elyas";

export type LocalDb = { pg: PGlite; catalog: Catalog };

function statements(sql: string) {
  return sql.split("\n--@@\n").map((s) => s.trim()).filter(Boolean);
}

export async function applySchema(pg: Pick<PGlite, "exec">) {
  for (const part of [prelude, schema, overrides, ...UPGRADES.map((u) => u[1])]) {
    for (const stmt of statements(part)) await pg.exec(stmt);
  }
}

/** Creates (first run) or opens the device database. `dataDir` "memory://" is used by tests. */
export async function openLocalDb(dataDir = `idb://${LOCAL_DB_NAME}`): Promise<LocalDb> {
  const [{ PGlite }, contribCrypto, contribUuid] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/pgcrypto"),
    import("@electric-sql/pglite/contrib/uuid_ossp"),
  ]);
  // In the phone build the package's own tarballs are not emitted, so ship
  // explicit copies as app assets (".bin" so the WebView never re-encodes them).
  const browser = typeof window !== "undefined";
  const [cryptoUrl, uuidUrl] = browser
    ? await Promise.all([import("./ext/pgcrypto.bin?url"), import("./ext/uuid-ossp.bin?url")]).then((m) => m.map((x) => x.default as string))
    : [null, null];
  const asset = (name: string, url: string) => ({ name, setup: async () => ({ bundlePath: new URL(url, window.location.href) }) });
  const pgcrypto = cryptoUrl ? asset("pgcrypto", cryptoUrl) : contribCrypto.pgcrypto;
  const uuid_ossp = uuidUrl ? asset("uuid-ossp", uuidUrl) : contribUuid.uuid_ossp;
  const { IdbFs } = await import("@electric-sql/pglite");
  // PGlite copies the whole data directory to IndexedDB after every statement,
  // which freezes the phone for seconds per screen. Persist only on explicit
  // flushes: after every write request, import, and schema setup.
  class FlushOnDemandIdbFs extends IdbFs {
    private allow = false;
    override async syncToFs(relaxed?: boolean) { if (this.allow) return super.syncToFs(relaxed); }
    async flush() { this.allow = true; try { await super.syncToFs(false); } finally { this.allow = false; } }
  }
  const pg = dataDir.startsWith("idb://")
    ? await PGlite.create({ fs: new FlushOnDemandIdbFs(dataDir.slice(6)), extensions: { pgcrypto, uuid_ossp } })
    : await PGlite.create(dataDir, { extensions: { pgcrypto, uuid_ossp } });
  await pg.exec("SET TimeZone = 'UTC'");
  const has = await pg.query<{ ok: boolean }>("select to_regclass('public.local_meta') is not null as ok");
  if (!has.rows[0]?.ok) {
    await pg.transaction(async (tx) => {
      await applySchema(tx);
      await tx.query("insert into public.local_meta(key, value) values ('schema_version', $1::jsonb)", [JSON.stringify(LOCAL_SCHEMA_VERSION)]);
    });
  } else {
    const current = Number((await getMeta<number>(pg, "schema_version")) ?? 1);
    const pending = UPGRADES.filter(([v]) => v > current);
    if (pending.length) {
      await pg.transaction(async (tx) => {
        for (const [, sql] of pending) for (const stmt of statements(sql)) await tx.exec(stmt);
        await setMeta(tx, "schema_version", LOCAL_SCHEMA_VERSION);
      });
    }
  }
  await flushToDisk(pg);
  const catalog = await loadCatalog(pg as unknown as SqlRunner);
  return { pg, catalog };
}

let dirty = false;
/** Called when a transaction assigned a transaction id, i.e. it changed data. */
export function markDirty() { dirty = true; }
/** Flushes only when something changed since the last flush (read-only RPCs stay instant). */
export async function flushIfDirty(pg: PGlite) {
  if (!dirty) return;
  dirty = false;
  await flushToDisk(pg);
}

/** Every write awaits a full flush to the phone's storage before the screen hears "saved". */
export async function flushToDisk(pg: PGlite) {
  const fs = (pg as unknown as { fs?: { flush?: () => Promise<void> } }).fs;
  if (fs?.flush) await fs.flush();
}

export async function getMeta<T>(pg: Pick<PGlite, "query">, key: string): Promise<T | null> {
  const r = await pg.query<{ value: T }>("select value from public.local_meta where key = $1", [key]);
  return r.rows[0]?.value ?? null;
}

export async function setMeta(pg: Pick<PGlite, "query">, key: string, value: unknown) {
  await pg.query("insert into public.local_meta(key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(value)]);
}
