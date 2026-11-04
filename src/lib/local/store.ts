// @ts-nocheck -- unused offline prototype imported as-is from the original project
// Persistence for the offline copy of the system: every table lives in the
// browser (IndexedDB) so the app keeps working with no network at all.
export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

const DB_NAME = "exchange-local";
const STORE = "kv";
const KEY = "db";

let cache: Tables | null = null;
let queue: Promise<void> = Promise.resolve();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRaw(): Promise<Tables | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as Tables) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function loadTables(): Promise<Tables> {
  if (cache) return cache;
  const stored = await readRaw();
  cache = stored ?? {};
  return cache;
}

export function getTables(): Tables {
  if (!cache) throw new Error("local database is not loaded yet");
  return cache;
}

export function setTables(tables: Tables) {
  cache = tables;
}

export async function saveTables(): Promise<void> {
  const snapshot = cache;
  if (!snapshot) return;
  const json = JSON.stringify(snapshot);
  queue = queue.then(async () => {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(JSON.parse(json) as Tables, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
  return queue;
}

export async function clearTables(): Promise<void> {
  cache = {};
  await saveTables();
}

export function tableOf(name: string): Row[] {
  const tables = getTables();
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

export function nextId(table: string): number {
  const rows = tableOf(table);
  return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
}

export function maxNumber(table: string, column: string, where?: (row: Row) => boolean): number {
  const rows = tableOf(table).filter((r) => (where ? where(r) : true));
  return rows.reduce((max, r) => Math.max(max, Number(r[column]) || 0), 0);
}
