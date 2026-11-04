# Regenerates src/lib/local-db/schema.sql (structure only, no data) from the
# cloud database catalog, for the offline "أبو الياس" app. Run after schema
# changes:  python3 scripts/local-db/extract-schema.py
import json
import subprocess

OUT = "src/lib/local-db/schema.sql"


def q(sql):
    return subprocess.run(["psql", "-tAX", "-c", sql], capture_output=True, text=True, check=True).stdout


def qj(sql):
    return json.loads(q(f"select coalesce(json_agg(t),'[]') from ({sql}) t"))


parts = []
P = parts.append
P("SET check_function_bodies = off;")
for r in qj("select t.typname, array_agg(e.enumlabel order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace group by 1"):
    P(f"CREATE TYPE public.{r['typname']} AS ENUM ({', '.join(repr(l) for l in r['labels'])});")
for r in qj("select c.relname, s.seqstart, s.seqincrement, s.seqtypid::regtype::text typ from pg_class c join pg_sequence s on s.seqrelid=c.oid where c.relnamespace='public'::regnamespace order by 1"):
    P(f"CREATE SEQUENCE public.{r['relname']} AS {r['typ']} START {r['seqstart']} INCREMENT {r['seqincrement']};")
for r in qj("select pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p') order by p.proname"):
    P(r["d"].rstrip() + ";")
tables = qj("select c.oid::int oid, c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1")
for t in tables:
    cols = qj(f"select a.attname, format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) def, a.attidentity ident, a.attgenerated gen from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid={t['oid']} and a.attnum>0 and not a.attisdropped order by a.attnum")
    lines = []
    for c in cols:
        s = f'  "{c["attname"]}" {c["typ"]}'
        if c["gen"] == "s":
            s += f" GENERATED ALWAYS AS ({c['def']}) STORED"
        elif c["ident"] in ("a", "d"):
            s += " GENERATED " + ("ALWAYS" if c["ident"] == "a" else "BY DEFAULT") + " AS IDENTITY"
        elif c["def"] is not None:
            s += f" DEFAULT {c['def']}"
        if c["nn"]:
            s += " NOT NULL"
        lines.append(s)
    P(f"CREATE TABLE public.{t['relname']} (\n" + ",\n".join(lines) + "\n);")
for r in qj("select c.relname seq, t.relname tab, a.attname col from pg_depend d join pg_class c on c.oid=d.objid and c.relkind='S' join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid where d.deptype='a' and c.relnamespace='public'::regnamespace"):
    P(f'ALTER SEQUENCE public.{r["seq"]} OWNED BY public.{r["tab"]}."{r["col"]}";')
for kind in ("p','u','c','x", "f"):
    for r in qj(f"select conrelid::regclass::text tab, conname, pg_get_constraintdef(oid) def from pg_constraint where connamespace='public'::regnamespace and contype in ('{kind}') and conrelid<>0 order by contype desc, 1, 2"):
        tab = r["tab"] if r["tab"].startswith("public.") else "public." + r["tab"]
        P(f'ALTER TABLE {tab} ADD CONSTRAINT "{r["conname"]}" {r["def"]};')
for r in qj("select pg_get_indexdef(i.indexrelid) d from pg_index i join pg_class c on c.oid=i.indexrelid where c.relnamespace='public'::regnamespace and not exists(select 1 from pg_constraint k where k.conindid=i.indexrelid)"):
    P(r["d"] + ";")
for r in qj("select pg_get_triggerdef(t.oid) d from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by c.relname, t.tgname"):
    P(r["d"] + ";")
for r in qj("select c.relname, pg_get_viewdef(c.oid) d from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m')"):
    P(f"CREATE VIEW public.{r['relname']} AS {r['d']}")
open(OUT, "w").write("\n--@@\n".join(parts) + "\n")
print(len(parts), "statements ->", OUT)
