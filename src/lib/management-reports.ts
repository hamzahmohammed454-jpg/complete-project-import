export type DailyReport = {
  volume: { kind: string; currency_id: number; count: number; amount: number }[];
  commissions: { currency_id: number; amount: number }[];
  staff: { created_by: string | null; name: string | null; kind: string; count: number }[];
  cash: { box_id: number; box_name: string | null; currency_id: number; opening: number; receipts: number; payments: number; closing: number }[];
  positions: { currency_id: number; amount: number }[];
  closings: { box_id: number; currency_id: number; difference: number }[];
};
export type ManagementAlerts = {
  checks: { id: number; number: string; amount: number; currency_id: number; date: string; days: number }[];
  transfers: { id: number; direction: "outgoing" | "incoming"; number: number | null; amount: number; currency_id: number; date: string; days: number; sender_name: string; receiver_name: string }[];
  prices: { currency_id: number; buy_price: number; sell_price: number; max_buy_price: number | null; min_sell_price: number | null; updated_at: string }[];
  cash_differences: { id: number; box_id: number; currency_id: number; date: string; difference: number }[];
};

export function checksInWindow<T extends { days: number }>(rows: readonly T[], days: number): T[] {
  return rows.filter((row) => row.days <= days).sort((a, b) => a.days - b.days);
}

export function transfersOlderThan<T extends { days: number }>(rows: readonly T[], days: number): T[] {
  return rows.filter((row) => row.days >= days).sort((a, b) => b.days - a.days);
}