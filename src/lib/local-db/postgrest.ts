// Local PostgREST: answers the data client's REST requests from the on-device
// database, so every screen keeps its existing queries in the offline app.
// Only the subset of PostgREST the app uses is implemented; anything else
// fails loudly instead of returning wrong data.

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type FkInfo = { name: string; table: string; cols: string[]; ref: string; refCols: string[] };
export type FnArg = { name: string; type: string };
export type FnInfo = { name: string; args: FnArg[]; returnsSet: boolean; returnsVoid: boolean; returnsTable: boolean };
export type Catalog = {
  tables: Map<string, { columns: Map<string, string>; pk: string[] }>;
  fks: FkInfo[];
  fns: Map<string, FnInfo[]>;
};

export class RestError extends Error {
  constructor(public status: number, public code: string, message: string, public details: string | null = null, public hint: string | null = null) {
    super(message);
  }
}

const q = (id: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new RestError(400, "PGRST100", `اسم غير صالح: ${id}`);
  return `"${id}"`;
};

export async function loadCatalog(db: SqlRunner): Promise<Catalog> {
  const cols = await db.query<{ t: string; c: string; typ: string }>(
    `select c.relname t, a.attname c, format_type(a.atttypid, a.atttypmod) typ
       from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v') and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`,
  );
  const pks = await db.query<{ t: string; cols: string[] }>(
    `select c.relname t, array_agg(a.attname order by k.ord) cols
       from pg_constraint x join pg_class c on c.oid = x.conrelid
       cross join lateral unnest(x.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
      where x.contype = 'p' and c.relnamespace = 'public'::regnamespace group by c.relname`,
  );
  const fks = await db.query<{ name: string; t: string; cols: string[]; ref: string; refcols: string[] }>(
    `select x.conname name, c.relname t, r.relname ref,
            (select array_agg(a.attname order by k.ord) from unnest(x.conkey) with ordinality k(n, ord) join pg_attribute a on a.attrelid = x.conrelid and a.attnum = k.n) cols,
            (select array_agg(a.attname order by k.ord) from unnest(x.confkey) with ordinality k(n, ord) join pg_attribute a on a.attrelid = x.confrelid and a.attnum = k.n) refcols
       from pg_constraint x join pg_class c on c.oid = x.conrelid join pg_class r on r.oid = x.confrelid
      where x.contype = 'f' and c.relnamespace = 'public'::regnamespace and r.relnamespace = 'public'::regnamespace`,
  );
  const fns = await db.query<{ name: string; argnames: string[] | null; argtypes: string[] | null; retset: boolean; rettype: string; argmodes: string[] | null }>(
    `select p.proname name, p.proargnames argnames, p.proargmodes::text[] argmodes,
            (select array_agg(format_type(t, null) order by o) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(t, o)) argtypes,
            p.proretset retset, format_type(p.prorettype, null) rettype
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`,
  );
  const tables: Catalog["tables"] = new Map();
  for (const r of cols.rows) {
    if (!tables.has(r.t)) tables.set(r.t, { columns: new Map(), pk: [] });
    tables.get(r.t)!.columns.set(r.c, r.typ);
  }
  for (const r of pks.rows) if (tables.has(r.t)) tables.get(r.t)!.pk = r.cols;
  const fnMap: Catalog["fns"] = new Map();
  for (const f of fns.rows) {
    if (f.rettype === "trigger") continue;
    const args: FnArg[] = [];
    (f.argtypes ?? []).forEach((type, i) => {
      const mode = f.argmodes?.[i] ?? "i";
      if (mode === "i" || mode === "b" || mode === "v") args.push({ name: f.argnames?.[i] ?? `$${i + 1}`, type });
    });
    const info: FnInfo = { name: f.name, args, returnsSet: f.retset, returnsVoid: f.rettype === "void", returnsTable: f.retset || f.rettype === "record" };
    fnMap.set(f.name, [...(fnMap.get(f.name) ?? []), info]);
  }
  return { tables, fks: fks.rows.map((f) => ({ name: f.name, table: f.t, cols: f.cols, ref: f.ref, refCols: f.refcols })), fns: fnMap };
}

/* ------------------------------ select parser ------------------------------ */

export type SelectItem =
  | { kind: "star" }
  | { kind: "col"; name: string; alias?: string | undefined; cast?: string | undefined; json?: string | undefined }
  | { kind: "embed"; rel: string; alias?: string | undefined; hint?: string | undefined; inner: boolean; items: SelectItem[] };

function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === sep) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(raw: string | null): SelectItem[] {
  const s = (raw ?? "*").replace(/\s+/g, "");
  if (s === "") return [{ kind: "star" }];
  return splitTop(s).map(parseItem);
}

function parseItem(item: string): SelectItem {
  if (item === "*") return { kind: "star" };
  const open = item.indexOf("(");
  if (open > 0 && item.endsWith(")")) {
    let head = item.slice(0, open);
    const inside = item.slice(open + 1, -1);
    let alias: string | undefined;
    const colon = head.indexOf(":");
    if (colon > 0) { alias = head.slice(0, colon); head = head.slice(colon + 1); }
    const [rel = "", ...mods] = head.split("!");
    let inner = false, hint: string | undefined;
    for (const m of mods) { if (m === "inner") inner = true; else if (m === "left") inner = false; else hint = m; }
    return { kind: "embed", rel, alias, hint, inner, items: inside === "" ? [{ kind: "star" }] : splitTop(inside).map(parseItem) };
  }
  let alias: string | undefined, name = item, cast: string | undefined;
  const colon = name.indexOf(":");
  if (colon > 0 && name[colon + 1] !== ":") { alias = name.slice(0, colon); name = name.slice(colon + 1); }
  const castAt = name.indexOf("::");
  if (castAt > 0) { cast = name.slice(castAt + 2); name = name.slice(0, castAt); }
  const arrow = name.search(/->/);
  if (arrow > 0) return { kind: "col", name: name.slice(0, arrow), json: name.slice(arrow), alias: alias ?? name.split(/->>?/).pop(), cast };
  return { kind: "col", name, alias, cast };
}

/* ------------------------------- filters ---------------------------------- */

export type Cond =
  | { kind: "op"; path: string[]; col: string; json?: string | undefined; not: boolean; op: string; value: string }
  | { kind: "logic"; path: string[]; op: "and" | "or"; not: boolean; items: Cond[] };

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function parseOpValue(path: string[], col: string, raw: string): Cond {
  let rest = raw, not = false;
  if (rest.startsWith("not.")) { not = true; rest = rest.slice(4); }
  const dot = rest.indexOf(".");
  if (dot < 0) throw new RestError(400, "PGRST100", `شرط غير مفهوم: ${col}=${raw}`);
  const op = rest.slice(0, dot);
  const value = rest.slice(dot + 1);
  let json: string | undefined;
  const arrow = col.search(/->/);
  if (arrow > 0) { json = col.slice(arrow); col = col.slice(0, arrow); }
  return { kind: "op", path, col, json, not, op, value };
}

function parseLogic(path: string[], op: "and" | "or", not: boolean, raw: string): Cond {
  const inner = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1) : raw;
  const items = splitTop(inner).map((part): Cond => {
    const m = part.match(/^(not\.)?(and|or)(\(.*\))$/);
    if (m) return parseLogic([], m[2] as "and" | "or", !!m[1], m[3] ?? "");
    const dot = part.indexOf(".");
    return parseOpValue([], part.slice(0, dot), part.slice(dot + 1));
  });
  return { kind: "logic", path, op, not, items };
}

export function parseFilters(params: URLSearchParams): Cond[] {
  const out: Cond[] = [];
  for (const [key, value] of params) {
    const segs = key.split(".");
    const last = segs[segs.length - 1] ?? "";
    if (RESERVED.has(last)) continue;
    const path = segs.slice(0, -1);
    if (last === "or" || last === "and") {
      if (path[path.length - 1] === "not") continue;
      out.push(parseLogic(path, last, false, value)); continue;
    }
    // "not.or=(...)" arrives as key "not.or"; handled below.
    out.push(parseOpValue(path, last, value));
  }
  for (const [key, value] of params) {
    const m = key.match(/^(?:(.*)\.)?not\.(or|and)$/);
    if (m) out.push(parseLogic(m[1] ? m[1].split(".") : [], m[2] as "and" | "or", true, value));
  }
  return out;
}

type Order = { col: string; dir: "asc" | "desc"; nulls?: "first" | "last"; json?: string | undefined };

export function parseOrder(raw: string | null): Order[] {
  if (!raw) return [];
  return splitTop(raw).map((part) => {
    const bits = part.split(".");
    let col = bits[0] ?? "";
    let json: string | undefined;
    const arrow = col.search(/->/);
    if (arrow > 0) { json = col.slice(arrow); col = col.slice(0, arrow); }
    const o: Order = { col, dir: "asc", json };
    for (const b of bits.slice(1)) {
      if (b === "desc" || b === "asc") o.dir = b;
      if (b === "nullsfirst") o.nulls = "first";
      if (b === "nullslast") o.nulls = "last";
    }
    return o;
  });
}

/* ------------------------------ SQL builder ------------------------------- */

class Params {
  values: unknown[] = [];
  add(v: unknown) { this.values.push(v); return `$${this.values.length}`; }
}

function jsonPath(base: string, json: string | undefined): string {
  if (!json) return base;
  const parts = json.match(/->>?[^-]+/g) ?? [];
  let expr = base;
  for (const p of parts) {
    const isText = p.startsWith("->>");
    const key = p.slice(isText ? 3 : 2);
    const k = /^\d+$/.test(key) ? key : `'${key.replace(/'/g, "''")}'`;
    expr = `(${expr}${isText ? "->>" : "->"}${k})`;
  }
  return expr;
}

function unquote(v: string) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
}

function condSql(c: Cond, alias: string, p: Params, table: string, cat: Catalog): string {
  if (c.kind === "logic") {
    const parts = c.items.map((i) => condSql(i, alias, p, table, cat));
    const s = parts.length ? `(${parts.join(c.op === "or" ? " OR " : " AND ")})` : "TRUE";
    return c.not ? `NOT ${s}` : s;
  }
  const cols = cat.tables.get(table)?.columns;
  if (!cols?.has(c.col)) throw new RestError(400, "42703", `العمود ${c.col} غير موجود في ${table}`);
  const colType = cols.get(c.col)!;
  const base = jsonPath(`${alias}.${q(c.col)}`, c.json);
  const isJsonText = !!c.json && c.json.includes("->>");
  const cast = c.json ? (isJsonText ? "text" : "jsonb") : colType;
  const val = (v: string) => `CAST(${p.add(unquote(v))} AS ${cast})`;
  let s: string;
  switch (c.op) {
    case "eq": s = `${base} = ${val(c.value)}`; break;
    case "neq": s = `${base} <> ${val(c.value)}`; break;
    case "gt": s = `${base} > ${val(c.value)}`; break;
    case "gte": s = `${base} >= ${val(c.value)}`; break;
    case "lt": s = `${base} < ${val(c.value)}`; break;
    case "lte": s = `${base} <= ${val(c.value)}`; break;
    case "like": s = `CAST(${base} AS text) LIKE ${p.add(unquote(c.value).replace(/\*/g, "%"))}`; break;
    case "ilike": s = `CAST(${base} AS text) ILIKE ${p.add(unquote(c.value).replace(/\*/g, "%"))}`; break;
    case "match": s = `CAST(${base} AS text) ~ ${p.add(unquote(c.value))}`; break;
    case "imatch": s = `CAST(${base} AS text) ~* ${p.add(unquote(c.value))}`; break;
    case "is": {
      const v = c.value.toLowerCase();
      if (v === "null") s = `${base} IS NULL`;
      else if (v === "true") s = `${base} IS TRUE`;
      else if (v === "false") s = `${base} IS FALSE`;
      else if (v === "unknown") s = `${base} IS UNKNOWN`;
      else throw new RestError(400, "PGRST100", `قيمة is غير مدعومة: ${c.value}`);
      break;
    }
    case "in": {
      const inner = c.value.replace(/^\(/, "").replace(/\)$/, "");
      const items = inner === "" ? [] : splitTop(inner);
      s = items.length ? `${base} IN (${items.map(val).join(", ")})` : "FALSE";
      break;
    }
    case "cs": s = `${base} @> ${val(c.value.startsWith("(") ? `{${c.value.slice(1, -1)}}` : c.value)}`; break;
    case "cd": s = `${base} <@ ${val(c.value.startsWith("(") ? `{${c.value.slice(1, -1)}}` : c.value)}`; break;
    case "ov": s = `${base} && ${val(c.value.startsWith("(") ? `{${c.value.slice(1, -1)}}` : c.value)}`; break;
    case "fts": case "plfts": case "phfts": case "wfts":
      s = `to_tsvector(CAST(${base} AS text)) @@ plainto_tsquery(${p.add(c.value.replace(/^\([^)]*\)\./, ""))})`; break;
    default:
      throw new RestError(400, "PGRST100", `عامل غير مدعوم: ${c.op}`);
  }
  return c.not ? `NOT (${s})` : s;
}

type Rel = { fk: FkInfo; toOne: boolean; target: string };

function resolveRel(cat: Catalog, from: string, rel: string, hint?: string): Rel {
  const candidates: Rel[] = [];
  for (const fk of cat.fks) {
    if (fk.table === from && fk.ref === rel) candidates.push({ fk, toOne: true, target: rel });
    if (fk.ref === from && fk.table === rel) candidates.push({ fk, toOne: false, target: rel });
  }
  // Embedding through the FK column name ("currency_id(...)") or constraint name.
  if (!cat.tables.has(rel)) {
    for (const fk of cat.fks) if (fk.table === from && (fk.cols[0] === rel || fk.name === rel)) candidates.push({ fk, toOne: true, target: fk.ref });
  }
  let list = candidates;
  if (hint) {
    list = candidates.filter((c) => c.fk.name === hint || c.fk.cols.includes(hint) || c.fk.refCols.includes(hint) && !c.toOne);
    if (list.length === 0) list = candidates.filter((c) => c.fk.name === hint || c.fk.cols[0] === hint);
  }
  if (list.length === 0) throw new RestError(400, "PGRST200", `لا توجد علاقة بين ${from} و ${rel}`);
  if (list.length > 1) {
    const exact = list.filter((c) => c.toOne && c.fk.cols[0] === `${rel.replace(/s$/, "")}_id`);
    if (exact.length === 1 && exact[0]) return exact[0];
    const toOne = list.filter((c) => c.toOne);
    if (toOne.length === 1 && !hint && toOne[0]) return toOne[0];
    throw new RestError(300, "PGRST201", `أكثر من علاقة بين ${from} و ${rel}؛ حدّد العلاقة`);
  }
  return list[0]!;
}

type Ctx = { cat: Catalog; p: Params; params: URLSearchParams; conds: Cond[]; counter: { n: number } };

function nextAlias(ctx: Ctx) { return `t${++ctx.counter.n}`; }

function embedPathKey(path: string[]) { return path.join("."); }

function columnList(items: SelectItem[], alias: string, table: string, path: string[], ctx: Ctx): string {
  const cols: string[] = [];
  const info = ctx.cat.tables.get(table);
  if (!info) throw new RestError(404, "42P01", `الجدول ${table} غير موجود`);
  for (const it of items) {
    if (it.kind === "star") { for (const c of info.columns.keys()) cols.push(`${alias}.${q(c)} AS ${q(c)}`); continue; }
    if (it.kind === "col") {
      if (it.name === "count" && !info.columns.has("count")) { cols.push(`count(*) AS ${q(it.alias ?? "count")}`); continue; }
      if (!info.columns.has(it.name)) throw new RestError(400, "42703", `العمود ${it.name} غير موجود في ${table}`);
      let e = jsonPath(`${alias}.${q(it.name)}`, it.json);
      if (it.cast) e = `CAST(${e} AS ${it.cast.replace(/[^a-z0-9_ \[\]]/gi, "")})`;
      cols.push(`${e} AS ${q(it.alias ?? it.name)}`);
      continue;
    }
    const rel = resolveRel(ctx.cat, table, it.rel, it.hint);
    const key = it.alias ?? it.rel;
    const sub = embedSql(it, rel, alias, [...path, key], ctx);
    cols.push(`${sub.expr} AS ${q(key)}`);
  }
  return cols.join(", ");
}

function joinCond(rel: Rel, parent: string, child: string) {
  return rel.fk.cols.map((c, i) => rel.toOne
    ? `${child}.${q(rel.fk.refCols[i] ?? "")} = ${parent}.${q(c)}`
    : `${child}.${q(c)} = ${parent}.${q(rel.fk.refCols[i] ?? "")}`).join(" AND ");
}

function condsFor(path: string[], ctx: Ctx) {
  const key = embedPathKey(path);
  return ctx.conds.filter((c) => embedPathKey(c.path) === key);
}

function hasCondsUnder(path: string[], ctx: Ctx) {
  const key = embedPathKey(path);
  return ctx.conds.some((c) => embedPathKey(c.path) === key || embedPathKey(c.path).startsWith(key + "."));
}

function embedWhere(it: Extract<SelectItem, { kind: "embed" }>, rel: Rel, parent: string, child: string, path: string[], ctx: Ctx): string {
  const where = [joinCond(rel, parent, child), ...condsFor(path, ctx).map((c) => condSql(c, child, ctx.p, rel.target, ctx.cat))];
  for (const sub of it.items) {
    if (sub.kind !== "embed" || !sub.inner) continue;
    const r2 = resolveRel(ctx.cat, rel.target, sub.rel, sub.hint);
    const a2 = nextAlias(ctx);
    where.push(`EXISTS (SELECT 1 FROM public.${q(r2.target)} ${a2} WHERE ${embedWhere(sub, r2, child, a2, [...path, sub.alias ?? sub.rel], ctx)})`);
  }
  return where.join(" AND ");
}

function embedSql(it: Extract<SelectItem, { kind: "embed" }>, rel: Rel, parent: string, path: string[], ctx: Ctx) {
  const child = nextAlias(ctx);
  const cols = columnList(it.items, child, rel.target, path, ctx);
  const where = embedWhere(it, rel, parent, child, path, ctx);
  const pre = embedPathKey(path) + ".";
  if (rel.toOne) {
    return { expr: `(SELECT row_to_json(x) FROM (SELECT ${cols} FROM public.${q(rel.target)} ${child} WHERE ${where} LIMIT 1) x)` };
  }
  const order = parseOrder(ctx.params.get(pre + "order")).map((o) => orderSql(o, child, rel.target, ctx)).join(", ");
  const limit = ctx.params.get(pre + "limit");
  const offset = ctx.params.get(pre + "offset");
  const tail = `${order ? ` ORDER BY ${order}` : ""}${limit ? ` LIMIT ${Number(limit) | 0}` : ""}${offset ? ` OFFSET ${Number(offset) | 0}` : ""}`;
  return { expr: `(SELECT coalesce(json_agg(x), '[]'::json) FROM (SELECT ${cols} FROM public.${q(rel.target)} ${child} WHERE ${where}${tail}) x)` };
}

function orderSql(o: Order, alias: string, table: string, ctx: Ctx) {
  if (!ctx.cat.tables.get(table)?.columns.has(o.col)) throw new RestError(400, "42703", `العمود ${o.col} غير موجود في ${table}`);
  return `${jsonPath(`${alias}.${q(o.col)}`, o.json)} ${o.dir.toUpperCase()}${o.nulls ? ` NULLS ${o.nulls.toUpperCase()}` : o.dir === "desc" ? " NULLS FIRST" : " NULLS LAST"}`;
}

/** Root WHERE: own filters, plus !inner embeds and filters that target embedded rows of inner joins. */
function rootWhere(items: SelectItem[], table: string, alias: string, ctx: Ctx): string[] {
  const where = condsFor([], ctx).map((c) => condSql(c, alias, ctx.p, table, ctx.cat));
  for (const it of items) {
    if (it.kind !== "embed") continue;
    const key = it.alias ?? it.rel;
    if (!it.inner) continue;
    const rel = resolveRel(ctx.cat, table, it.rel, it.hint);
    const a = nextAlias(ctx);
    where.push(`EXISTS (SELECT 1 FROM public.${q(rel.target)} ${a} WHERE ${embedWhere(it, rel, alias, a, [key], ctx)})`);
  }
  // Filters on non-inner to-one embeds behave like PostgREST: they only null the embed.
  void hasCondsUnder;
  return where;
}

export type RestRequest = { method: string; path: string; search: string; headers: Headers; body: string | null };
export type RestResponse = { status: number; headers: Record<string, string>; body: string | null };

function prefer(headers: Headers) {
  const raw = headers.get("prefer") ?? "";
  return {
    representation: /return=representation/.test(raw),
    count: /count=(exact|planned|estimated)/.test(raw),
    merge: /resolution=merge-duplicates/.test(raw),
    ignore: /resolution=ignore-duplicates/.test(raw),
  };
}

function rangeOf(headers: Headers, params: URLSearchParams): { offset: number; limit: number | null } {
  let offset = Number(params.get("offset") ?? 0) || 0;
  let limit: number | null = params.has("limit") ? Number(params.get("limit")) : null;
  const r = headers.get("range");
  if (r) {
    const m = r.match(/^(\d+)-(\d*)$/);
    if (m) { offset = Number(m[1]); if (m[2] !== "") limit = Number(m[2]) - offset + 1; }
  }
  return { offset, limit };
}

function wantsObject(headers: Headers) {
  return (headers.get("accept") ?? "").includes("vnd.pgrst.object+json");
}

function ok(status: number, data: unknown, extra: Record<string, string> = {}, head = false): RestResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", ...extra }, body: head ? null : JSON.stringify(data) };
}

function asObject(rows: unknown[]): RestResponse | null {
  if (rows.length !== 1) {
    return { status: 406, headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }) };
  }
  return null;
}

async function selectRows(db: SqlRunner, table: string, selectRaw: string | null, extraWhere: { sql: string; p: Params } | null, req: RestRequest, ctxBase: { cat: Catalog; params: URLSearchParams }, opts: { applyFilters: boolean; applyRange: boolean; count: boolean }) {
  const p = extraWhere?.p ?? new Params();
  const ctx: Ctx = { cat: ctxBase.cat, p, params: ctxBase.params, conds: opts.applyFilters ? parseFilters(ctxBase.params) : [], counter: { n: 0 } };
  const items = parseSelect(selectRaw);
  const alias = "t0";
  const cols = columnList(items, alias, table, [], ctx);
  const where = [...rootWhere(items, table, alias, ctx), ...(extraWhere ? [extraWhere.sql] : [])];
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const order = parseOrder(ctxBase.params.get("order")).map((o) => orderSql(o, alias, table, ctx)).join(", ");
  const { offset, limit } = opts.applyRange ? rangeOf(req.headers, ctxBase.params) : { offset: 0, limit: null };
  const hasAgg = items.some((i) => i.kind === "col" && i.name === "count" && !ctx.cat.tables.get(table)?.columns.has("count"));
  const groupBy = hasAgg ? (() => {
    const plain = items.filter((i) => i.kind === "col" && i.name !== "count") as Extract<SelectItem, { kind: "col" }>[];
    return plain.length ? ` GROUP BY ${plain.map((i) => `${alias}.${q(i.name)}`).join(", ")}` : "";
  })() : "";
  const inner = `SELECT ${cols} FROM public.${q(table)} ${alias}${whereSql}${groupBy}${order ? ` ORDER BY ${order}` : ""}${limit != null ? ` LIMIT ${limit | 0}` : ""}${offset ? ` OFFSET ${offset | 0}` : ""}`;
  const res = await db.query<{ j: unknown[] }>(`SELECT coalesce(json_agg(r), '[]'::json) AS j FROM (${inner}) r`, p.values);
  const rows = (res.rows[0]?.j ?? []) as unknown[];
  let total: number | null = null;
  if (opts.count) {
    const c = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${q(table)} ${alias}${whereSql}`, p.values);
    total = c.rows[0]?.n ?? 0;
  }
  return { rows, total, offset };
}

function contentRange(offset: number, n: number, total: number | null) {
  const span = n > 0 ? `${offset}-${offset + n - 1}` : "*";
  return `${span}/${total ?? "*"}`;
}

function pkWhere(cat: Catalog, table: string, keys: Record<string, unknown>[], p: Params) {
  const pk = cat.tables.get(table)?.pk ?? [];
  if (pk.length === 0) throw new RestError(400, "PGRST100", `الجدول ${table} بلا مفتاح أساسي`);
  if (keys.length === 0) return "FALSE";
  return `(${keys.map((k) => `(${pk.map((c) => `t0.${q(c)} = ${p.add(k[c] === null ? null : String(k[c]))}`).join(" AND ")})`).join(" OR ")})`;
}

function jsonable(v: unknown) {
  return v;
}

export async function handleRest(db: SqlRunner, cat: Catalog, req: RestRequest): Promise<RestResponse> {
  const params = new URLSearchParams(req.search);
  const method = req.method.toUpperCase();
  const pref = prefer(req.headers);
  if (req.path.startsWith("rpc/")) return handleRpc(db, cat, req.path.slice(4), method, params, req);
  const table = req.path;
  const info = cat.tables.get(table);
  if (!info) throw new RestError(404, "42P01", `الجدول ${table} غير موجود`);
  const base = { cat, params };

  if (method === "GET" || method === "HEAD") {
    const { rows, total, offset } = await selectRows(db, table, params.get("select"), null, req, base, { applyFilters: true, applyRange: true, count: pref.count });
    const headers = { "content-range": contentRange(offset, rows.length, total) };
    if (wantsObject(req.headers)) return asObject(rows) ?? ok(200, rows[0], headers, method === "HEAD");
    return ok(200, rows, headers, method === "HEAD");
  }

  if (method === "POST") {
    const parsed = req.body ? JSON.parse(req.body) : [];
    const list: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    const columnsParam = params.get("columns")?.split(",").map((c) => c.replace(/"/g, ""));
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of list) {
      const keys = (columnsParam ?? Object.keys(row)).filter((k) => info.columns.has(k));
      for (const k of Object.keys(row)) if (!info.columns.has(k)) throw new RestError(400, "PGRST204", `العمود ${k} غير موجود في ${table}`);
      const sig = keys.join(",");
      groups.set(sig, [...(groups.get(sig) ?? []), row]);
    }
    const conflict = params.get("on_conflict")?.split(",") ?? info.pk;
    const keysOut: Record<string, unknown>[] = [];
    for (const [sig, rows] of groups) {
      const keys = sig ? sig.split(",") : [];
      const colList = keys.map(q).join(", ");
      let sql: string;
      if (keys.length === 0) sql = `INSERT INTO public.${q(table)} DEFAULT VALUES`;
      else sql = `INSERT INTO public.${q(table)} (${colList}) SELECT ${colList} FROM json_populate_recordset(NULL::public.${q(table)}, $1::json)`;
      if (pref.merge || pref.ignore) {
        const target = conflict.map(q).join(", ");
        const updates = keys.filter((k) => !conflict.includes(k)).map((k) => `${q(k)} = EXCLUDED.${q(k)}`);
        sql += pref.ignore || updates.length === 0 ? ` ON CONFLICT (${target}) DO NOTHING` : ` ON CONFLICT (${target}) DO UPDATE SET ${updates.join(", ")}`;
      }
      sql += ` RETURNING ${info.pk.map(q).join(", ") || "1"}`;
      if (keys.length === 0) {
        for (const _ of rows) keysOut.push(...(await db.query<Record<string, unknown>>(sql)).rows);
      } else {
        keysOut.push(...(await db.query<Record<string, unknown>>(sql, [JSON.stringify(rows.map(jsonable))])).rows);
      }
    }
    if (!pref.representation) return { status: 201, headers: {}, body: null };
    const p = new Params();
    const where = pkWhere(cat, table, keysOut, p);
    const { rows } = await selectRows(db, table, params.get("select"), { sql: where, p }, req, { cat, params: new URLSearchParams({ ...(params.get("select") ? { select: params.get("select")! } : {}) }) }, { applyFilters: false, applyRange: false, count: false });
    if (wantsObject(req.headers)) return asObject(rows) ?? ok(201, rows[0]);
    return ok(201, rows);
  }

  if (method === "PATCH" || method === "DELETE") {
    const p = new Params();
    const ctx: Ctx = { cat, p, params, conds: parseFilters(params), counter: { n: 0 } };
    const where = condsFor([], ctx).map((c) => condSql(c, "t0", p, table, cat));
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const pk = info.pk.map((c) => `t0.${q(c)}`).join(", ") || "1";
    let keysOut: Record<string, unknown>[];
    let deletedRows: unknown[] = [];
    if (method === "PATCH") {
      const body = req.body ? JSON.parse(req.body) : {};
      const keys = Object.keys(body);
      for (const k of keys) if (!info.columns.has(k)) throw new RestError(400, "PGRST204", `العمود ${k} غير موجود في ${table}`);
      if (keys.length === 0) return ok(pref.representation ? 200 : 204, []);
      const bodyParam = p.add(JSON.stringify(body));
      const set = keys.map((k) => `${q(k)} = src.${q(k)}`).join(", ");
      keysOut = (await db.query<Record<string, unknown>>(`UPDATE public.${q(table)} t0 SET ${set} FROM json_populate_record(NULL::public.${q(table)}, ${bodyParam}::json) src${whereSql} RETURNING ${pk}`, p.values)).rows;
    } else {
      if (pref.representation) {
        const pre = await selectRows(db, table, params.get("select"), null, req, base, { applyFilters: true, applyRange: false, count: false });
        deletedRows = pre.rows;
      }
      keysOut = (await db.query<Record<string, unknown>>(`DELETE FROM public.${q(table)} t0${whereSql} RETURNING ${pk}`, p.values)).rows;
    }
    if (!pref.representation) return { status: 204, headers: {}, body: null };
    if (method === "DELETE") return wantsObject(req.headers) ? asObject(deletedRows) ?? ok(200, deletedRows[0]) : ok(200, deletedRows);
    const p2 = new Params();
    const w = pkWhere(cat, table, keysOut, p2);
    const { rows } = await selectRows(db, table, params.get("select"), { sql: w, p: p2 }, req, { cat, params: new URLSearchParams(params.get("select") ? { select: params.get("select")! } : {}) }, { applyFilters: false, applyRange: false, count: false });
    if (wantsObject(req.headers)) return asObject(rows) ?? ok(200, rows[0]);
    return ok(200, rows);
  }
  throw new RestError(405, "PGRST117", `طريقة غير مدعومة: ${method}`);
}

async function handleRpc(db: SqlRunner, cat: Catalog, name: string, method: string, params: URLSearchParams, req: RestRequest): Promise<RestResponse> {
  const overloads = cat.fns.get(name);
  if (!overloads) throw new RestError(404, "PGRST202", `الدالة ${name} غير موجودة`);
  let args: Record<string, unknown> = {};
  if (method === "GET" || method === "HEAD") { for (const [k, v] of params) if (!RESERVED.has(k)) args[k] = v; }
  else args = req.body ? JSON.parse(req.body) : {};
  const keys = Object.keys(args);
  const fn = overloads.find((f) => keys.every((k) => f.args.some((a) => a.name === k)) && f.args.length >= keys.length) ?? overloads[0];
  if (!fn) throw new RestError(404, "PGRST202", `الدالة ${name} غير موجودة`);
  const p = new Params();
  const used = fn.args.filter((a) => keys.includes(a.name));
  const argParam = used.length ? p.add(JSON.stringify(args)) : "";
  const call = `public.${q(name)}(${fn.args.filter((a) => keys.includes(a.name)).map((a) => {
    const isJson = a.type === "json" || a.type === "jsonb";
    const isArray = a.type.endsWith("[]");
    const expr = isJson ? `(${argParam}::jsonb->'${a.name}')` : isArray
      ? `(SELECT array_agg(e) FROM jsonb_array_elements_text(${argParam}::jsonb->'${a.name}') e)`
      : `(${argParam}::jsonb->>'${a.name}')`;
    return `${q(a.name)} => CAST(${expr} AS ${a.type})`;
  }).join(", ")})`;
  if (fn.returnsVoid) {
    await db.query(`SELECT ${call}`, p.values);
    return { status: 204, headers: {}, body: null };
  }
  if (fn.returnsSet) {
    const res = await db.query<{ j: unknown[] }>(`SELECT coalesce(json_agg(x), '[]'::json) AS j FROM ${call} x`, p.values);
    const rows = res.rows[0]?.j ?? [];
    if (wantsObject(req.headers)) return asObject(rows) ?? ok(200, rows[0]);
    return ok(200, rows);
  }
  const res = await db.query<{ j: unknown }>(`SELECT to_json(${call}) AS j`, p.values);
  return ok(200, res.rows[0]?.j ?? null);
}

export function errorResponse(e: unknown): RestResponse {
  if (e instanceof RestError) return { status: e.status, headers: { "content-type": "application/json" }, body: JSON.stringify({ code: e.code, message: e.message, details: e.details, hint: e.hint }) };
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const code = err?.code ?? "XX000";
  const status = code === "23505" || code === "23503" ? 409
    : code === "42501" ? 403
    : code === "42883" || code === "42P01" ? 404
    : code.startsWith("08") ? 503 : 400;
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify({ code, message: err?.message ?? String(e), details: err?.detail ?? null, hint: err?.hint ?? null }) };
}
