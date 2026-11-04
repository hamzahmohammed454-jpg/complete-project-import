/** نسخة JSON كاملة قابلة للتحقق: بيان بعدد السجلات وبصمة SHA-256 لكل جدول. */
export type SnapshotTable = { table: string; rows: Record<string, unknown>[] };
export type SnapshotManifestEntry = { table: string; count: number; sha256: string };
export type Snapshot = {
  format: "al-sarafa-snapshot";
  version: 1;
  created_at: string;
  manifest: SnapshotManifestEntry[];
  tables: Record<string, Record<string, unknown>[]>;
};

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildSnapshot(tables: SnapshotTable[], createdAt: string): Promise<Snapshot> {
  const manifest: SnapshotManifestEntry[] = [];
  const out: Snapshot["tables"] = {};
  for (const t of tables) {
    out[t.table] = t.rows;
    manifest.push({ table: t.table, count: t.rows.length, sha256: await sha256(JSON.stringify(t.rows)) });
  }
  return { format: "al-sarafa-snapshot", version: 1, created_at: createdAt, manifest, tables: out };
}

export type VerifyResult =
  | { ok: false; error: string }
  | { ok: true; created_at: string; problems: string[]; tables: SnapshotManifestEntry[] };

/** يتحقق من سلامة ملف النسخة دون الكتابة على أي بيانات. */
export async function verifySnapshot(text: string): Promise<VerifyResult> {
  let s: Snapshot;
  try {
    s = JSON.parse(text);
  } catch {
    return { ok: false, error: "الملف ليس نسخة صالحة (تعذّرت قراءته)." };
  }
  if (s?.format !== "al-sarafa-snapshot" || !Array.isArray(s.manifest) || !s.tables) {
    return { ok: false, error: "الملف ليس نسخة احتياطية من هذا النظام." };
  }
  const problems: string[] = [];
  for (const m of s.manifest) {
    const rows = s.tables[m.table];
    if (!Array.isArray(rows)) { problems.push(`${m.table}: الجدول مفقود من الملف`); continue; }
    if (rows.length !== m.count) problems.push(`${m.table}: عدد السجلات ${rows.length} بدل ${m.count}`);
    if ((await sha256(JSON.stringify(rows))) !== m.sha256) problems.push(`${m.table}: البيانات تغيّرت أو تلفت`);
  }
  return { ok: true, created_at: s.created_at, problems, tables: s.manifest };
}
