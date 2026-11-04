export const DOCUMENT_PREFIX: Record<string, string> = { receipt: "REC", payment: "PAY", deposit: "DEP", journal: "JRN", buy: "BUY", sell: "SELL", incoming: "IN", outgoing: "OUT", entry: "ENT", check_in: "CHI", check_out: "CHO", settlement: "SET" };
export function documentNumber(kind: string, number: number | string | null | undefined): string {
  const n = Number(number);
  if (!Number.isSafeInteger(n) || n < 1) return "قيد المزامنة";
  return `${DOCUMENT_PREFIX[kind] ?? kind}-${String(n).padStart(6, "0")}`;
}