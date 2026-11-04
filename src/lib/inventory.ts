export type InventoryCount = { currency_id: number; system_amount: number; real_amount: number };
export function inventoryAdjustment(line: InventoryCount) {
  if (!Number.isFinite(line.real_amount) || line.real_amount < 0 || !Number.isFinite(line.system_amount)) throw new Error("مبلغ الجرد غير صحيح");
  const difference = Math.round((line.real_amount - line.system_amount) * 10000) / 10000;
  return { difference, amount: Math.abs(difference), boxSide: difference >= 0 ? "مدين" : "دائن", counterpartSide: difference >= 0 ? "دائن" : "مدين" };
}
export function inventoryActions(active: boolean, voided: boolean, hasDifference: boolean) {
  return { post: !active && !voided && hasDifference, edit: !active && !voided, remove: !active && !voided, reverse: active && !voided };
}