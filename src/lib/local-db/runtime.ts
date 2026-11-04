// Runtime of the offline "أبو الياس" app: opens the phone database, signs users
// in locally and answers every data/auth/storage request of the app's data
// client, so screens work unchanged without internet.
import { openLocalDb, getMeta, setMeta, flushToDisk, flushIfDirty, markDirty, type LocalDb } from "./engine";
import { errorResponse, handleRest, RestError, type RestResponse } from "./postgrest";

let dbPromise: Promise<LocalDb> | null = null;
export function localDb(): Promise<LocalDb> {
  if (!dbPromise) {
    dbPromise = openLocalDb().catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

/* --------------------------------- tokens --------------------------------- */

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s: string) => b64url(enc.encode(s));
const fromB64url = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return new Uint8Array([...atob(pad)].map((c) => c.charCodeAt(0)));
};

let keyPromise: Promise<CryptoKey> | null = null;
async function signingKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = (async () => {
    const { pg } = await localDb();
    let secret = await getMeta<string>(pg, "token_secret");
    if (!secret) {
      secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      await setMeta(pg, "token_secret", secret);
      await flushToDisk(pg);
    }
    return crypto.subtle.importKey("raw", fromB64url(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })();
  return keyPromise;
}

type Claims = { sub: string; email: string; session_id: string; exp: number; iat: number; role: "authenticated"; aud: "authenticated"; aal: "aal1"; amr: { method: string; timestamp: number }[]; kind: "access" | "refresh" };

const TOKEN_LIFETIME = 60 * 60 * 24 * 365;

async function signToken(c: Omit<Claims, "exp" | "iat" | "role" | "aud" | "aal" | "amr">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = { ...c, iat: now, exp: now + TOKEN_LIFETIME, role: "authenticated", aud: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: now }] };
  const head = b64urlText(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlText(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

async function verifyToken(token: string | null | undefined, kind: Claims["kind"] = "access"): Promise<Claims | null> {
  if (!token) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) return null;
  const valid = await crypto.subtle.verify("HMAC", await signingKey(), fromB64url(sig), enc.encode(`${head}.${body}`));
  if (!valid) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Claims;
  if (claims.kind !== kind || claims.exp < Date.now() / 1000) return null;
  return claims;
}

/* ---------------------------------- users --------------------------------- */

type UserRow = { id: string; email: string; raw_user_meta_data: Record<string, unknown>; created_at: string; updated_at: string; last_sign_in_at: string | null };

function userJson(u: UserRow) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], factors: [], created_at: u.created_at, updated_at: u.updated_at, is_anonymous: false,
  };
}

async function findUser(where: "id" | "email", value: string): Promise<(UserRow & { encrypted_password: string | null }) | null> {
  const { pg } = await localDb();
  const r = await pg.query<UserRow & { encrypted_password: string | null }>(`select id, email, raw_user_meta_data, created_at, updated_at, last_sign_in_at, encrypted_password from auth.users where ${where === "id" ? "id = $1::uuid" : "lower(email) = lower($1)"}`, [value]);
  return r.rows[0] ?? null;
}

export async function localCreateUser(email: string, password: string, meta: Record<string, unknown>): Promise<string> {
  const { pg } = await localDb();
  const exists = await findUser("email", email);
  if (exists) throw new Error("EXISTS");
  const r = await pg.query<{ id: string }>(
    "insert into auth.users(id, email, encrypted_password, raw_user_meta_data) values (gen_random_uuid(), $1, extensions.crypt($2, extensions.gen_salt('bf', 10)), $3::jsonb) returning id",
    [email.toLowerCase(), password, JSON.stringify(meta)],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("CREATE_FAILED");
  // Same as the cloud signup trigger: every account gets its display profile.
  await pg.query("insert into public.profiles(id, full_name, phone, username) values ($1, coalesce($2, ''), coalesce($3, ''), nullif($4, '')) on conflict (id) do nothing", [id, meta["full_name"] ?? "", meta["phone"] ?? "", meta["username"] ?? ""]);
  markDirty();
  await flushToDisk(pg);
  return id;
}

export async function localSetPassword(userId: string, password: string) {
  const { pg } = await localDb();
  await pg.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)), updated_at = now() where id = $1::uuid", [userId, password]);
  markDirty();
  await flushToDisk(pg);
}

async function issueSession(u: UserRow, sessionId: string = crypto.randomUUID()) {
  const access = await signToken({ sub: u.id, email: u.email, session_id: sessionId, kind: "access" });
  const refresh = await signToken({ sub: u.id, email: u.email, session_id: sessionId, kind: "refresh" });
  const now = Math.floor(Date.now() / 1000);
  return { access_token: access, token_type: "bearer", expires_in: TOKEN_LIFETIME, expires_at: now + TOKEN_LIFETIME, refresh_token: refresh, user: userJson(u) };
}

/* ------------------------------ request router ---------------------------- */

const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(data === null ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const authError = (status: number, code: string, msg: string) => json(status, { code: status, error_code: code, msg, message: msg, error: code, error_description: msg });

async function handleAuth(path: string, url: URL, req: Request): Promise<Response> {
  const { pg } = await localDb();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (path === "token") {
    const grant = url.searchParams.get("grant_type");
    const body = await req.json().catch(() => ({}));
    if (grant === "password") {
      const u = await findUser("email", String(body.email ?? ""));
      if (!u?.encrypted_password) return authError(400, "invalid_credentials", "Invalid login credentials");
      const ok = await pg.query<{ ok: boolean }>("select extensions.crypt($1, $2) = $2 as ok", [String(body.password ?? ""), u.encrypted_password]);
      if (!ok.rows[0]?.ok) return authError(400, "invalid_credentials", "Invalid login credentials");
      await pg.query("update auth.users set last_sign_in_at = now() where id = $1::uuid", [u.id]);
      markDirty();
      return json(200, await issueSession(u));
    }
    if (grant === "refresh_token") {
      const c = await verifyToken(body.refresh_token, "refresh");
      const u = c ? await findUser("id", c.sub) : null;
      if (!c || !u) return authError(400, "refresh_token_not_found", "Invalid Refresh Token");
      return json(200, await issueSession(u, c.session_id));
    }
    return authError(400, "unsupported_grant_type", "غير مدعوم في النسخة المحلية");
  }
  if (path === "logout") return new Response(null, { status: 204 });
  if (path === "user") {
    const c = await verifyToken(bearer);
    const u = c ? await findUser("id", c.sub) : null;
    if (!c || !u) return authError(401, "bad_jwt", "invalid JWT");
    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.password === "string") {
        if (body.password.length < 8) return authError(422, "weak_password", "Password should be at least 8 characters.");
        await localSetPassword(u.id, body.password);
      }
      if (body.data && typeof body.data === "object") { await pg.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1::uuid", [u.id, JSON.stringify(body.data)]); markDirty(); }
      return json(200, userJson((await findUser("id", u.id))!));
    }
    return json(200, userJson(u));
  }
  if (path === "settings") return json(200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true });
  if (path.startsWith("factors")) return authError(422, "mfa_unavailable", "التحقق الثنائي غير متاح في النسخة المحلية");
  return authError(404, "not_found", "غير متاح في النسخة المحلية");
}

function toResponse(r: RestResponse) {
  return new Response(r.body, { status: r.status, headers: r.headers });
}

async function withClaims<T>(claims: Claims | null, fn: (tx: import("@electric-sql/pglite").Transaction) => Promise<T>): Promise<T> {
  const { pg } = await localDb();
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.session_id', $2, true)", [claims?.sub ?? "", claims?.session_id ?? ""]);
    const out = await fn(tx);
    const w = await tx.query<{ x: string | null }>("select pg_current_xact_id_if_assigned()::text x");
    if (w.rows[0]?.x) markDirty();
    return out;
  });
}

async function handleData(path: string, url: URL, req: Request): Promise<Response> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const claims = await verifyToken(bearer);
  const { catalog } = await localDb();
  const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
  try {
    if (!claims) throw new RestError(401, "PGRST301", "سجّل الدخول أولًا");
    const res = await withClaims(claims, (tx) => handleRest(tx as never, catalog, { method: req.method, path, search: url.search, headers: req.headers, body }));
    return toResponse(res);
  } catch (e) {
    return toResponse(errorResponse(e));
  }
}

async function handleStorage(path: string, url: URL, req: Request): Promise<Response> {
  const claims = await verifyToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!claims) return json(401, { statusCode: "401", error: "Unauthorized", message: "سجّل الدخول أولًا" });
  const { pg } = await localDb();
  let m = path.match(/^object\/list\/([^/]+)$/);
  if (m) {
    const body = await req.json().catch(() => ({}));
    const prefix = String(body.prefix ?? "").replace(/\/$/, "");
    const r = await pg.query<{ path: string; created_at: string; content_type: string; size: number }>("select path, created_at, content_type, octet_length(content) size from public.local_files where bucket = $1 and path like $2 order by path", [m[1], prefix ? `${prefix}/%` : "%"]);
    return json(200, r.rows.map((f) => ({ name: f.path.slice(prefix ? prefix.length + 1 : 0), id: f.path, created_at: f.created_at, updated_at: f.created_at, metadata: { mimetype: f.content_type, size: f.size } })));
  }
  m = path.match(/^object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
  if (m && req.method === "POST") {
    const [, bucket, file] = m;
    let blob: Blob = await req.blob();
    let type = req.headers.get("content-type") ?? "application/octet-stream";
    if (type.startsWith("multipart/form-data")) {
      const form = await new Response(blob, { headers: { "content-type": type } }).formData();
      const part = [...form.values()].find((v) => v instanceof Blob) as Blob | undefined;
      if (part) { blob = part; type = part.type || "application/octet-stream"; }
    }
    if (blob.size > 6 * 1024 * 1024) return json(413, { statusCode: "413", error: "Payload too large", message: "الملف كبير" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await pg.query("insert into public.local_files(bucket, path, content_type, content) values ($1, $2, $3, $4)", [bucket, decodeURIComponent(file ?? ""), type, bytes]);
    markDirty();
    return json(200, { Key: `${bucket}/${file}`, Id: file });
  }
  if (m && req.method === "GET") {
    const r = await pg.query<{ content: Uint8Array; content_type: string }>("select content, content_type from public.local_files where bucket = $1 and path = $2", [m[1], decodeURIComponent(m[2] ?? "")]);
    if (!r.rows[0]) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
    return new Response(r.rows[0].content as BlobPart, { status: 200, headers: { "content-type": r.rows[0].content_type } });
  }
  m = path.match(/^object\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    const body = await req.json().catch(() => ({}));
    const list: string[] = body.prefixes ?? [];
    for (const p of list) await pg.query("delete from public.local_files where bucket = $1 and path = $2", [m[1], p]);
    markDirty();
    return json(200, list.map((name) => ({ name })));
  }
  return json(400, { statusCode: "400", error: "unsupported", message: "غير متاح في النسخة المحلية" });
}

/** Routes the data client's requests to the phone database instead of the internet. */
export function installLocalFetch(dataUrl: string) {
  const w = window as Window & { __localFetchInstalled?: boolean };
  if (w.__localFetchInstalled) return;
  w.__localFetchInstalled = true;
  const base = dataUrl.replace(/\/+$/, "");
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const href = req.url;
    if (href.startsWith(base + "/")) {
      const url = new URL(href);
      const rest = url.pathname.slice(new URL(base).pathname.replace(/\/$/, "").length + 1);
      const logEntry = { m: req.method, p: (rest + url.search).slice(0, 160), s: 0, t: Date.now(), d: 0 };
      const log = ((globalThis as { __localLog?: typeof logEntry[] }).__localLog ??= []);
      log.push(logEntry); if (log.length > 300) log.shift();
      try {
        const res = rest.startsWith("rest/v1/") ? await handleData(decodeURIComponent(rest.slice(8)), url, req)
          : rest.startsWith("auth/v1/") ? await handleAuth(rest.slice(8), url, req)
          : rest.startsWith("storage/v1/") ? await handleStorage(rest.slice(11), url, req)
          : json(404, { message: "غير متاح في النسخة المحلية" });
        await flushIfDirty((await localDb()).pg);
        logEntry.s = res.status; logEntry.d = Date.now() - logEntry.t;
        if (res.status >= 400) console.warn("[local]", req.method, rest + url.search, res.status, (await res.clone().text()).slice(0, 300));
        return res;
      } catch (e) {
        console.error("[local]", e);
        return json(500, { message: e instanceof Error ? e.message : "خطأ محلي" });
      }
    }
    if (new URL(href, location.href).pathname.startsWith("/_serverFn")) {
      return json(503, { message: "هذه الخدمة تحتاج الإنترنت وغير متاحة في النسخة المحلية" });
    }
    return realFetch(input, init);
  };
}

/* ------------------------------- local admin ------------------------------ */

export async function localAdminExists(): Promise<boolean> {
  const { pg } = await localDb();
  const r = await pg.query<{ n: number }>("select count(*)::int n from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin' and u.encrypted_password is not null");
  return (r.rows[0]?.n ?? 0) > 0;
}

/** Runs privileged local work as the signed-in user, after the same checks the cloud makes. */
export async function asCurrentUser<T>(fn: (tx: import("@electric-sql/pglite").Transaction, userId: string) => Promise<T>): Promise<T> {
  const raw = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  const session = raw ? JSON.parse(localStorage.getItem(raw) ?? "null") : null;
  const claims = await verifyToken(session?.access_token);
  if (!claims) throw new Error("FORBIDDEN");
  const out = await withClaims(claims, (tx) => fn(tx, claims.sub));
  await flushToDisk((await localDb()).pg);
  return out;
}
