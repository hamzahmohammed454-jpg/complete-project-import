export type VoucherAmountInput = { currency_id: string; amount: string };

export function multiVoucherLines(lines: readonly VoucherAmountInput[]) {
  if (lines.length < 2) throw new Error("أدخل عملتين على الأقل");
  const parsed = lines.map((line) => ({ currency_id: Number(line.currency_id), amount: Number(line.amount) }));
  if (parsed.some((line) => !Number.isSafeInteger(line.currency_id) || line.currency_id <= 0 || !Number.isFinite(line.amount) || line.amount <= 0)) {
    throw new Error("اختر العملة وأدخل مبلغاً أكبر من صفر لكل سطر");
  }
  if (new Set(parsed.map((line) => line.currency_id)).size !== parsed.length) throw new Error("اختر كل عملة مرة واحدة");
  return parsed;
}

export function groupVoucherRows<T extends { batch_id: string | null; batch_position: number | null }>(rows: readonly T[]): (T & { amounts: T[] })[] {
  const groups = new Map<string, T & { amounts: T[] }>();
  const result: (T & { amounts: T[] })[] = [];
  for (const row of rows) {
    if (!row.batch_id) { result.push({ ...row, amounts: [row] }); continue; }
    const group = groups.get(row.batch_id);
    if (group) group.amounts.push(row);
    else {
      const item = { ...row, amounts: [row] };
      groups.set(row.batch_id, item);
      result.push(item);
    }
  }
  return result.map((group) => {
    group.amounts.sort((a, b) => (a.batch_position ?? 0) - (b.batch_position ?? 0));
    return { ...group, ...group.amounts[0], amounts: group.amounts };
  });
}