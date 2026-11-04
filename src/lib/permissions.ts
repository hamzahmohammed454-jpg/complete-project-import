export type PermissionAction = "view" | "create" | "update" | "delete" | "print";
export type ScreenPermission = { screen_path: string; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean; can_print: boolean; extra_actions?: Record<string, boolean> };
const BASIC: readonly string[] = ["view", "create", "update", "delete", "print"];
/** زر خاص غير محدد في المجموعة يتبع صلاحية العرض، والمربع غير المؤشَّر يمنعه. */
export function permits(action: PermissionAction | string, rows: readonly ScreenPermission[]): boolean {
  return rows.some((row) => {
    if (!row.can_view) return false;
    if (BASIC.includes(action)) return row[`can_${action as PermissionAction}`];
    return row.extra_actions?.[action] ?? true;
  });
}
