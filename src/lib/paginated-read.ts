export async function collectPages<T>(load: (from: number, until: number) => Promise<T[]>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const page = await load(from, from + size - 1);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}