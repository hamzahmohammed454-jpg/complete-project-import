// Offline layer for the database API: caches every successful read and queues
// writes made without network in an ordered outbox that replays when online.
// The server (triggers + RLS) stays the source of truth for numbers and balances.
import { idbGet, idbSet, idbSetMany, idbClearPrefix } from "./idb";
import {
  describeRequest,
  isAlreadySaved,
  withClientRef,
  hasUnresolvedTemp,
  PENDING_LABEL,
  remapIds,
  syncErrorMessage,
  TEMP_PREFIX,
  type OutboxItem,
  requestUserId,
  canReplayAs,
  canQueueRequest,
  dependentItemIds,
} from "./outbox-core";

const OUTBOX_KEY = "outbox";
const IDMAP_KEY = "idmap";
const READ_PREFIX = "read:";
const META_KEY = "cache-meta";
export type CacheMeta = { lastReadAt: number | null; lastSyncAt: number | null; cachedReads: number };
let cacheMeta: CacheMeta = { lastReadAt: null, lastSyncAt: null, cachedReads: 0 };
const cachedKeys = new Set<string>();
let ownerId: string | null = null;
let storageAvailable = true;
let identityVersion = 0;
let loadIdentity: Promise<void> = Promise.resolve();
let saves: Promise<void> = Promise.resolve();
const scopedKey = (key: string, user = ownerId) => `user:${user ?? "signed-out"}:${key}`;
/** Identity comes from auth events, never from a delayed request belonging to another login. */
export function setOfflineIdentity(user: string | null): Promise<void> {
  if (ownerId === user) return loadIdentity;
  const version = ++identityVersion;
  ownerId = user; storageAvailable = true; outbox = []; idMap = {}; cachedKeys.clear(); cacheMeta = { lastReadAt: null, lastSyncAt: null, cachedReads: 0 }; emit();
  loadIdentity = (async () => {
    await saves.catch(() => undefined);
    if (!user || version !== identityVersion) return;
    const stored = await idbGet<OutboxItem[]>(scopedKey(OUTBOX_KEY, user));
    if (version !== identityVersion) return;
    const ids = await idbGet<Record<string, string | number>>(scopedKey(IDMAP_KEY, user));
    if (version !== identityVersion) return;
    const meta = await idbGet<CacheMeta>(scopedKey(META_KEY, user));
    if (version !== identityVersion) return;
    cacheMeta = meta ?? cacheMeta;
    outbox = (stored ?? []).map((item) => ({ ...item, status: item.status === "syncing" ? "pending" : item.status }));
    idMap = ids ?? {}; emit();
  })().catch(() => { if (version === identityVersion) { storageAvailable = false; emit(); } });
  return loadIdentity;
}
export function suspendOfflineIdentity() { return setOfflineIdentity(null); }

let realFetch: typeof fetch;
let outbox: OutboxItem[] = [];
let idMap: Record<string, string | number> = {};
let syncing = false;
let installed = false;
const listeners = new Set<() => void>();

export function subscribeOutbox(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getOutbox() {
  return outbox;
}
export function getCacheMeta() { return cacheMeta; }
function emit() {
  listeners.forEach((fn) => fn());
}
async function persist() {
  if (!ownerId) return;
  if (!storageAvailable) throw new Error("OFFLINE_STORAGE_UNAVAILABLE");
  const user = ownerId;
  const queue = structuredClone(outbox); const ids = { ...idMap };
  const save = saves.catch(() => undefined).then(async () => {
    await idbSetMany([[scopedKey(OUTBOX_KEY, user), queue], [scopedKey(IDMAP_KEY, user), ids]]);
  });
  saves = save;
  await save;
  if (ownerId === user) emit();
}

async function completeItem(item: OutboxItem, version: number) {
  const before = outbox;
  outbox = outbox.filter((entry) => entry.id !== item.id);
  try { await persist(); }
  catch (error) {
    if (version === identityVersion) { outbox = before; item.status = "failed"; item.error = "تعذّر تثبيت نتيجة الإرسال على الهاتف؛ أعد التحقق دون إنشاء عملية جديدة"; emit(); }
    throw error;
  }
}

function headersObj(h: Headers): Record<string, string> {
  const o: Record<string, string> = {};
  h.forEach((v, k) => {
    if (k.toLowerCase() !== "authorization") o[k] = v;
  });
  return o;
}

function readKey(url: string, h: Headers) {
  return scopedKey(READ_PREFIX + url + "|" + ["accept", "range", "range-unit", "prefer", "accept-profile"].map((key) => h.get(key) ?? "").join("|"));
}

function isNetworkError(e: unknown) {
  return e instanceof TypeError;
}

function echoResponse(item: OutboxItem, accept: string | null): Response {
  let payload: unknown = null;
  if (item.method !== "DELETE" && item.body && !item.url.includes("/rpc/")) {
    try {
      const parsed = JSON.parse(item.body);
      const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((r: Record<string, unknown>) => ({
        ...r,
        ...(item.method === "POST" && r["id"] == null ? { id: item.tempId } : {}),
        _pending: true,
        _pending_label: PENDING_LABEL,
      }));
      payload = accept?.includes("vnd.pgrst.object") ? rows[0] : rows;
    } catch {
      payload = null;
    }
  }
  return new Response(payload == null ? null : JSON.stringify(payload), {
    status: payload == null ? 204 : 201,
    headers: { "content-type": "application/json" },
  });
}

async function enqueue(req: Request, body: string | null, reference: string): Promise<Response> {
  const user = requestUserId(req.headers.get("authorization"));
  if (!user || user !== ownerId) return new Response(JSON.stringify({ message: "OFFLINE_IDENTITY_REQUIRED" }), { status: 401 });
  const version = identityVersion;
  const isInsert = req.method === "POST" && !req.url.includes("/rpc/");
  const item: OutboxItem = {
    ownerId: user,
    id: reference,
    createdAt: Date.now(),
    method: req.method,
    url: req.url,
    headers: headersObj(req.headers),
    body,
    tempId: isInsert ? TEMP_PREFIX + crypto.randomUUID() : null,
    label: describeRequest(req.method, req.url),
    status: "pending",
  };
  if (isInsert) item.body = withClientRef(req.url, body, item.id);
  outbox = [...outbox, item];
  try { await persist(); }
  catch {
    if (version === identityVersion) { outbox = outbox.filter((entry) => entry.id !== item.id); emit(); }
    return new Response(JSON.stringify({ message: "تعذّر الحفظ على الهاتف؛ لم تُحفظ العملية للمزامنة. احتفظ بالبيانات وأعد المحاولة." }), { status: 507, headers: { "content-type": "application/json" } });
  }
  if (version !== identityVersion) return new Response(null, { status: 401 });
  return echoResponse(item, req.headers.get("accept"));
}

async function authHeader(): Promise<string | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  return data.session ? `Bearer ${data.session.access_token}` : null;
}

/** Replay queued operations strictly in order; stops at the first refusal. */
export async function syncOutbox() {
  if (syncing || !storageAvailable || !navigator.onLine || outbox.length === 0) return;
  syncing = true;
  const version = identityVersion;
  let accepted = false;
  try {
    const auth = await authHeader();
    if (!auth || version !== identityVersion) return;
    const user = requestUserId(auth);
    await loadIdentity;
    if (version !== identityVersion || user !== ownerId) return;
    for (const item of [...outbox]) {
      if (version !== identityVersion || !canReplayAs(item, user)) break;
      if (item.status === "failed") break;
      if (!canQueueRequest(item.method, item.url, item.body)) {
        item.status = "failed"; item.error = "هذه العملية تحتاج اتصالًا ومراجعة مباشرة؛ لم تُرسل ولم تُحذف من الهاتف";
        await persist(); break;
      }
      if (hasUnresolvedTemp(item, idMap)) {
        item.status = "failed";
        item.error = "تعتمد على عملية سابقة لم تُزامن";
        await persist();
        break;
      }
      item.status = "syncing";
      emit();
      const headers: Record<string, string> = { ...item.headers, authorization: auth };
      delete headers["x-offline-intent"];
      if (item.tempId) headers["prefer"] = "return=representation";
      let res: Response;
      try {
        res = await realFetch(remapIds(item.url, idMap), {
          method: item.method,
          headers,
          body: item.body ? remapIds(item.body, idMap) : null,
        });
      } catch {
        if (version !== identityVersion) break;
        item.status = "pending";
        emit();
        break;
      }
      if (version !== identityVersion) break;
      let refRow: unknown = null;
      if (!res.ok) {
        const text = await res.text();
        if (version !== identityVersion) break;
        if (isAlreadySaved(res.status, text)) {
          // Saved on an earlier attempt whose reply was lost: look up its real id.
          const base = item.url.split("?")[0];
          const r = await realFetch(`${base}?select=id&client_ref=eq.${item.id}`, { headers });
          if (version !== identityVersion) break;
          refRow = r.ok ? await r.json() : null;
          if (version !== identityVersion) break;
          if (!r.ok || !Array.isArray(refRow) || !refRow[0]?.id) { item.status = "failed"; item.error = "تعذّر التأكد من العملية المسجلة؛ لم تُحذف من قائمة المزامنة"; await persist(); break; }
          if (item.tempId && Array.isArray(refRow) && refRow[0]?.id != null) idMap[item.tempId] = refRow[0].id;
          await completeItem(item, version);
          accepted = true;
          continue;
        }
        item.status = "failed";
        item.error = syncErrorMessage(res.status, text);
        await persist();
        break;
      }
      if (item.tempId) {
        try {
          const data = await res.json();
          if (version !== identityVersion) break;
          const row = Array.isArray(data) ? data[0] : data;
          if (row?.id == null) throw new Error("MISSING_SAVED_ID");
          idMap[item.tempId] = row.id;
        } catch {
          if (version !== identityVersion) break;
          item.status = "failed";
          item.error = "تعذّر تأكيد رقم العملية المحفوظة؛ أعد المحاولة للتحقق دون تكرارها";
          await persist();
          break;
        }
      }
      if (version !== identityVersion) break;
      await completeItem(item, version);
      accepted = true;
    }
  } finally {
    syncing = false;
    emit();
    if (version !== identityVersion && outbox.length && navigator.onLine) void syncOutbox();
    if (accepted && version === identityVersion) {
      cacheMeta = { ...cacheMeta, lastSyncAt: Date.now() };
      await idbSet(scopedKey(META_KEY), cacheMeta).catch(() => undefined); emit();
      const { getActiveQueryClient } = await import("./query-client-ref");
      if (version === identityVersion) void getActiveQueryClient()?.invalidateQueries();
    }
  }
}

export async function retryItem(id: string) {
  const it = outbox.find((o) => o.id === id);
  if (it) {
    it.status = "pending";
    delete it.error;
    await persist();
  }
  await syncOutbox();
}

export async function discardItem(id: string) {
  if (outbox.some((item) => item.id === id && item.status === "syncing")) throw new Error("انتظر انتهاء الإرسال قبل الحذف");
  if (dependentItemIds(outbox, id).size > 0) throw new Error("توجد عمليات تعتمد عليها؛ احذف العمليات التابعة أولًا");
  outbox = outbox.filter((o) => o.id !== id);
  await persist();
}

export async function clearOfflineData() {
  if (outbox.length > 0) throw new Error("لا يمكن مسح البيانات مع وجود عمليات تنتظر المزامنة");
  outbox = [];
  idMap = {};
  await persist();
  await idbClearPrefix(scopedKey(READ_PREFIX));
}

/** Install once in the browser. Wraps window.fetch for the database API only. */
export async function installOfflineLayer() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = (import.meta.env['VITE_SUPABASE_URL'] as string | undefined)?.replace(/\/+$/, "");
  if (!base) return;
  realFetch = window.fetch.bind(window);
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: sessionData } = await supabase.auth.getSession();
  await setOfflineIdentity(sessionData.session?.user.id ?? null);

  window.fetch = async (input, init) => {
    const req = new Request(input, init);
    if (!req.url.startsWith(base + "/rest/v1/")) return realFetch(input, init);
    // Security and privileged RPCs must never be echoed as successful or replayed blindly.
    if (req.url.includes("/rpc/")) return realFetch(req);
    await loadIdentity;
    const user = requestUserId(req.headers.get("authorization"));
    if (!user) return realFetch(req);
    if (user !== ownerId) return new Response(null, { status: 401 });
    if (!storageAvailable) {
      if (navigator.onLine && (req.method === "GET" || req.method === "HEAD")) return realFetch(req);
      return new Response(JSON.stringify({ message: "تعذّر الحفظ على الهاتف؛ لا يمكن التأكد من العمليات السابقة. أعد فتح التطبيق دون مسح بياناته." }), { status: 507, headers: { "content-type": "application/json" } });
    }
    const version = identityVersion;
    // activity log writes are not worth queuing
    const isActivity = req.url.includes("/activity_log");

    if (req.method === "GET" || req.method === "HEAD") {
      const key = readKey(req.url, req.headers);
      if (navigator.onLine) {
        try {
          const res = await realFetch(req.clone());
          if (res.ok) {
            const text = await res.clone().text();
            if (version === identityVersion) {
              try {
                await idbSet(key, { text, headers: Object.fromEntries(res.headers.entries()), savedAt: Date.now() });
                if (version === identityVersion) {
                  cachedKeys.add(key);
                  cacheMeta = { ...cacheMeta, lastReadAt: Date.now(), cachedReads: cachedKeys.size };
                  await idbSet(scopedKey(META_KEY), cacheMeta); emit();
                }
              } catch { /* A cache failure must not fail a successful live read. */ }
            }
          }
          if (version !== identityVersion) return new Response(null, { status: 401 });
          return res;
        } catch (e) {
          if (!isNetworkError(e)) throw e;
        }
      }
      const cached = await idbGet<{ text: string; headers: Record<string, string> }>(key);
      if (version !== identityVersion) return new Response(null, { status: 401 });
      if (cached) return new Response(req.method === "HEAD" ? null : cached.text, { status: 200, headers: { ...cached.headers, "x-offline-cached": "true" } });
      const single = req.headers.get("accept")?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify({ message: single ? "OFFLINE_RECORD_NOT_CACHED" : "OFFLINE_DATA_NOT_CACHED" }), { status: 503, headers: { "content-type": "application/json" } });
    }

    const body = req.body ? await req.clone().text() : null;
    if (version !== identityVersion) return new Response(null, { status: 401 });
    const touchesPending = (req.url + (body ?? "")).includes(TEMP_PREFIX);
    const supported = canQueueRequest(req.method, req.url, body) && !req.headers.get("prefer")?.includes("resolution=");
    const reference = crypto.randomUUID();
    const stableBody = supported ? withClientRef(req.url, body, reference) : body;
    const stableReq = supported ? new Request(req, { body: stableBody }) : req;
    if (supported && req.headers.get("x-offline-intent") === "true") {
      // Commit the reference before sending: process death must not lose an ambiguous intent.
      const response = await enqueue(req, stableBody, reference);
      if (!response.ok) return response;
      const item = outbox.find((entry) => entry.id === reference);
      if (navigator.onLine && !touchesPending) await syncOutbox().catch(() => undefined);
      if (version !== identityVersion) return new Response(null, { status: 401 });
      if (item?.tempId && !outbox.some((entry) => entry.id === reference) && idMap[item.tempId] != null) {
        return new Response(JSON.stringify([{ id: idMap[item.tempId] }]), { status: 201, headers: { "content-type": "application/json" } });
      }
      return response;
    }
    if (navigator.onLine && outbox.length === 0 && !touchesPending) {
      try {
        return await realFetch(stableReq);
      } catch (e) {
        if (!isNetworkError(e) || isActivity) throw e;
      }
    } else if (isActivity) {
      return new Response(null, { status: 204 });
    }
    // Audited forms explicitly understand pending results; other screens never get fake success.
    if (!supported || req.headers.get("x-offline-intent") !== "true") return new Response(JSON.stringify({ message: "هذه العملية تحتاج اتصالًا بالإنترنت؛ لم تُنفّذ ولم تُحفظ للمزامنة" }), { status: 503, headers: { "content-type": "application/json" } });
    const res = await enqueue(req, stableBody, reference);
    void syncOutbox().catch(() => undefined);
    return res;
  };

  window.addEventListener("online", () => void syncOutbox().catch(() => undefined));
  window.addEventListener("focus", () => void syncOutbox().catch(() => undefined));
  emit();
  void syncOutbox().catch(() => undefined);
}
