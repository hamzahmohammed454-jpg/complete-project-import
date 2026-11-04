export type VoucherKind = "receipt" | "payment" | "deposit";
export type VoucherType = "قبض" | "صرف" | "إيداع";

export const KIND_OF: Record<VoucherType, VoucherKind> = {
  "قبض": "receipt", "صرف": "payment", "إيداع": "deposit",
};

export function voucherScreenType(kind?: VoucherKind): VoucherType {
  return kind === "payment" ? "صرف" : kind === "deposit" ? "إيداع" : "قبض";
}