export type WorkDefaults = { box_id: number | null; currency_id: number | null; branch_id: number | null; enforce_box?: boolean; enforce_currency?: boolean; allow_past_date?: boolean; allow_future_date?: boolean; allow_buy?: boolean; allow_sell?: boolean };

export function tradeAllowed(rules: { allow_buy?: boolean; allow_sell?: boolean } | null | undefined, kind: "buy" | "sell", admin: boolean): boolean {
  return admin || (kind === "buy" ? rules?.allow_buy !== false : rules?.allow_sell !== false);
}

export function defaultBoxId(assigned: number | null | undefined, remembered: string | null, boxes: readonly { id: number }[]): string {
  const box = boxes.find((b) => b.id === assigned) ?? boxes.find((b) => String(b.id) === remembered) ?? (boxes.length === 1 ? boxes[0] : undefined);
  return box ? String(box.id) : "";
}

export function defaultCurrencyId(assigned: number | null | undefined, currencies: readonly { id: number }[]): string {
  return currencies.some((c) => c.id === assigned) ? String(assigned) : "";
}
export function assignmentAllows(defaults: WorkDefaults | null, boxId: number | null, currencyId: number | null): boolean {
  return (!defaults?.enforce_box || boxId === defaults.box_id) && (!defaults?.enforce_currency || currencyId === defaults.currency_id);
}

/** Mirrors the guard_staff_date trigger: a staff member may be denied back-dated or future-dated operations. */
export function dateAllowed(rules: { allow_past_date?: boolean; allow_future_date?: boolean } | null, date: string, today: string): boolean {
  if (date < today) return rules?.allow_past_date !== false;
  if (date > today) return rules?.allow_future_date !== false;
  return true;
}
