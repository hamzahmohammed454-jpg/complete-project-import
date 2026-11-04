/** Thrown when RLS silently filtered an update/delete to zero rows. */
export const NO_PERMISSION = "NO_PERMISSION";

/** Arabic message for a failed delete, from the database error code/message. */
export function deleteErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? "";
  if (msg.includes(NO_PERMISSION)) return "لا تملك صلاحية الحذف";
  if (msg.includes("HAS_CHILDREN")) return "لا يمكن الحذف — تحته حسابات فرعية";
  if (err?.code === "23503" || msg.includes("IN_USE")) return "لا يمكن الحذف — عليه عمليات مسجّلة";
  return "تعذّر الحذف";
}

/** Arabic message for a failed edit. */
export function editErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if ((err?.message ?? "").includes(NO_PERMISSION)) return "لا تملك صلاحية التعديل";
  if (err?.code === "23505") return "القيمة مستخدمة لسجل آخر";
  return "تعذّر حفظ التعديل";
}

/** Throws NO_PERMISSION when an update/delete returned no rows. */
export function ensureAffected(rows: unknown[] | null) {
  if (!rows || rows.length === 0) throw new Error(NO_PERMISSION);
}
