export function checkCoversTransfer(check: { amount: number; currency_id: number; check_type: string; status: string }, amount: number, commission: number, currencyId: number): boolean {
  return check.check_type === "وارد" && check.status !== "مرتجع" && check.currency_id === currencyId && Math.abs(check.amount - amount - commission) < 0.000001;
}
export function canExportBeforeCollection(status: string): boolean {
  return status === "تحت التحصيل" || status === "محصل";
}