export type EntryLineInput = { side: string; amount: string; currency_id: string; account_id: string };
export function isEntryBalanced(lines: readonly EntryLineInput[]): boolean {
  if (lines.length < 2) return false;
  const totals = new Map<string, { net: number; debit: number }>();
  for (const line of lines) {
    const amount = Number(line.amount);
    if (!line.account_id || !line.currency_id || !Number.isFinite(amount) || amount <= 0 || !["مدين", "دائن"].includes(line.side)) return false;
    const rounded = Math.round((amount + Number.EPSILON) * 10000);
    const total = totals.get(line.currency_id) ?? { net: 0, debit: 0 };
    total.net += line.side === "مدين" ? rounded : -rounded;
    if (line.side === "مدين") total.debit += rounded;
    totals.set(line.currency_id, total);
  }
  return [...totals.values()].every((total) => total.net === 0 && total.debit > 0);
}