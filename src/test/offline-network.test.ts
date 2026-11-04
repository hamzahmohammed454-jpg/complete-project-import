import { afterEach, beforeEach, expect, it, vi } from "vitest";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const db = new Map<string, unknown>();
const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), many: vi.fn(), clear: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/offline/idb", () => ({ idbGet: mock.get, idbSet: mock.set, idbSetMany: mock.many, idbClearPrefix: mock.clear }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mock.session } } }));
const token = (user: string) => `header.${btoa(JSON.stringify({ sub: user }))}.signature`;
const savedFetch = window.fetch;
const pending = (ownerId: string) => ({ ownerId, id: "ref", createdAt: 0, method: "POST", url: "https://data.example/rest/v1/customers", headers: {}, body: '{"full_name":"Test","client_ref":"ref"}', tempId: "pending-test", label: "", status: "pending" });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); db.clear();
  vi.stubEnv("VITE_SUPABASE_URL", "https://data.example");
  mock.get.mockImplementation(async (key: string) => structuredClone(db.get(key)));
  mock.set.mockImplementation(async (key: string, value: unknown) => { db.set(key, structuredClone(value)); });
  mock.many.mockImplementation(async (entries: [string, unknown][]) => { for (const [key, value] of entries) db.set(key, structuredClone(value)); });
  mock.session.mockResolvedValue({ data: { session: { user: { id: a }, access_token: token(a) } } });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  window.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
});
afterEach(() => { window.fetch = savedFetch; vi.unstubAllEnvs(); });
it("stores an offline insert under its auth owner and never resurrects that queue after logout", async () => {
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  const res = await window.fetch("https://data.example/rest/v1/customers", { method: "POST", headers: { authorization: `Bearer ${token(a)}`, "x-offline-intent": "true" }, body: '{"full_name":"Test"}' });
  expect(res.status).toBe(201); expect(layer.getOutbox()).toHaveLength(1);
  expect(db.get(`user:${a}:outbox`)).toHaveLength(1);
  await layer.setOfflineIdentity(b); expect(layer.getOutbox()).toHaveLength(0);
  expect((await window.fetch("https://data.example/rest/v1/customers", { headers: { authorization: `Bearer ${token(a)}` } })).status).toBe(401);
  await layer.setOfflineIdentity(a); expect(layer.getOutbox()).toHaveLength(1);
});
it("does not restore a delayed identity load after signout", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]);
  let release: (() => void) | undefined;
  mock.get.mockImplementation(async (key: string) => { if (key.endsWith(":outbox")) await new Promise<void>((resolve) => { release = resolve; }); return db.get(key); });
  const layer = await import("@/lib/offline/network"); const loading = layer.setOfflineIdentity(a);
  await vi.waitFor(() => expect(release).toBeDefined());
  const suspended = layer.suspendOfflineIdentity(); release?.(); await loading; await suspended;
  expect(layer.getOutbox()).toHaveLength(0);
});
it("preserves both users' queues when an old replay body resolves after an account switch", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]); db.set(`user:${b}:outbox`, [pending(b)]);
  let release: (() => void) | undefined;
  window.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => { await new Promise<void>((resolve) => { release = resolve; }); return [{ id: 50 }]; } });
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const syncing = layer.syncOutbox(); await vi.waitFor(() => expect(release).toBeDefined());
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await layer.setOfflineIdentity(b); release?.(); await syncing;
  expect(layer.getOutbox()).toEqual([pending(b)]);
  expect(db.get(`user:${a}:outbox`)).toEqual([pending(a)]);
  expect(db.get(`user:${b}:idmap`)).toBeUndefined();
});
it("never echoes a privileged offline RPC as success", async () => {
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  await expect(window.fetch("https://data.example/rest/v1/rpc/apply_activation_code", { method: "POST", headers: { authorization: `Bearer ${token(a)}` }, body: '{}' })).rejects.toThrow("offline");
  expect(layer.getOutbox()).toHaveLength(0);
});
it("keeps a refused expired-license operation for retry after activation", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]);
  window.fetch = vi.fn().mockResolvedValue(new Response('{"message":"LICENSE_READ_ONLY"}', { status: 403 }));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await layer.syncOutbox();
  expect(layer.getOutbox()).toHaveLength(1);
  expect(layer.getOutbox()[0]?.status).toBe("failed");
  expect(db.get(`user:${a}:outbox`)).toHaveLength(1);
});
it("does not discard an accepted insert when its saved id cannot be read", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]);
  window.fetch = vi.fn().mockResolvedValue(new Response("[]", { status: 201 }));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await layer.syncOutbox();
  expect(layer.getOutbox()).toHaveLength(1);
  expect(layer.getOutbox()[0]?.status).toBe("failed");
  expect(db.get(`user:${a}:outbox`)).toHaveLength(1);
});

it("never queues offline edits, deletes, settlement or non-pending-aware forms", async () => {
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  for (const [method, table, headers] of [["PATCH", "incoming_transfers", { "x-offline-intent": "true" }], ["DELETE", "customers", {}], ["POST", "agent_settlements", { "x-offline-intent": "true" }], ["POST", "customers", {}]] as const) {
    const result = await window.fetch(`https://data.example/rest/v1/${table}`, { method, headers: { authorization: `Bearer ${token(a)}`, ...headers }, ...(method !== "DELETE" ? { body: '{}' } : {}) });
    expect(result.status).toBe(503);
  }
  expect(layer.getOutbox()).toHaveLength(0);
});

it("preserves the same reference when an online commit loses its reply", async () => {
  let firstRef: string | undefined;
  const network = vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => {
    firstRef = JSON.parse(String(init.body)).client_ref;
    expect(db.get(`user:${a}:outbox`)).toHaveLength(1);
    throw new TypeError("lost reply");
  })
    .mockResolvedValue(new Response('{"code":"23505","message":"customers_client_ref_key"}', { status: 409 }));
  window.fetch = network;
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const response = await window.fetch("https://data.example/rest/v1/customers", { method: "POST", headers: { authorization: `Bearer ${token(a)}`, "x-offline-intent": "true" }, body: '{"full_name":"Lost reply"}' });
  expect(response.status).toBe(201);
  expect(firstRef).toMatch(/^[a-f0-9-]{36}$/);
  expect(layer.getOutbox()[0]?.status).toBe("pending");
  expect(layer.getOutbox()[0]?.id).toBe(firstRef);
  expect(JSON.parse(layer.getOutbox()[0]?.body ?? '{}').client_ref).toBe(firstRef);
});

it("keeps the accepted intent visible if completing the local checkpoint fails", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]);
  window.fetch = vi.fn().mockResolvedValue(new Response('[{"id":50}]', { status: 201 }));
  mock.many.mockRejectedValueOnce(new Error("disk full"));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await expect(layer.syncOutbox()).rejects.toThrow("disk full");
  expect(layer.getOutbox()).toHaveLength(1);
  expect(layer.getOutbox()[0]?.status).toBe("failed");
  expect(db.get(`user:${a}:outbox`)).toHaveLength(1);
});

it("allows online reads but refuses new writes when the old queue cannot be read", async () => {
  mock.get.mockRejectedValue(new Error("storage unavailable"));
  window.fetch = vi.fn().mockResolvedValue(new Response('[{"id":1}]'));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  expect((await window.fetch("https://data.example/rest/v1/customers", { headers: { authorization: `Bearer ${token(a)}` } })).status).toBe(200);
  expect((await window.fetch("https://data.example/rest/v1/customers", { method: "POST", headers: { authorization: `Bearer ${token(a)}`, "x-offline-intent": "true" }, body: '{}' })).status).toBe(507);
  expect(mock.many).not.toHaveBeenCalled();
});

it("fails safely without echoing success when the phone cannot persist an intent", async () => {
  mock.many.mockRejectedValueOnce(new Error("quota"));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  const response = await window.fetch("https://data.example/rest/v1/customers", { method: "POST", headers: { authorization: `Bearer ${token(a)}`, "x-offline-intent": "true" }, body: '{"full_name":"Test"}' });
  expect(response.status).toBe(507); expect(layer.getOutbox()).toHaveLength(0);
});

it("separates cached reads by range and rejects missing data rather than returning an empty ledger", async () => {
  window.fetch = vi.fn().mockImplementation(async (req: Request) => new Response(JSON.stringify([{ id: req.headers.get("range") === "0-0" ? 1 : 2 }]), { headers: { "content-type": "application/json" } }));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  const read = (range: string) => window.fetch("https://data.example/rest/v1/customers?select=id", { headers: { authorization: `Bearer ${token(a)}`, range } });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await read("0-0"); await read("1-1");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  expect(await (await read("0-0")).json()).toEqual([{ id: 1 }]);
  expect(await (await read("1-1")).json()).toEqual([{ id: 2 }]);
  expect((await read("2-2")).status).toBe(503);
});

it("recovers an already committed replay by reference and removes exactly that pending request", async () => {
  db.set(`user:${a}:outbox`, [pending(a)]);
  window.fetch = vi.fn().mockResolvedValueOnce(new Response('{"code":"23505","message":"customers_client_ref_key"}', { status: 409 }))
    .mockResolvedValueOnce(new Response('[{"id":50}]', { status: 200 }));
  const layer = await import("@/lib/offline/network"); await layer.installOfflineLayer();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await layer.syncOutbox();
  expect(layer.getOutbox()).toHaveLength(0); expect(db.get(`user:${a}:idmap`)).toEqual({ "pending-test": 50 });
});