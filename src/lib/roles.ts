export type AppRole = "admin" | "manager" | "teller" | "accountant";

const MANAGER_ROLES: readonly AppRole[] = ["admin", "manager"];
const has = (roles: readonly string[], allowed: readonly AppRole[]) => roles.some((r) => allowed.includes(r as AppRole));

/** Commission rules are added and edited by the manager only (admin counts as manager). */
export function canManageCommissions(roles: readonly string[]): boolean {
  return has(roles, MANAGER_ROLES);
}

/** Canceling a transfer, reopening a closed box, editing daily rates, agents and boxes are manager-only. */
export function isManager(roles: readonly string[]): boolean {
  return has(roles, MANAGER_ROLES);
}

/** System admin only: staff, currencies. */
export function isAdmin(roles: readonly string[]): boolean {
  return has(roles, ["admin"]);
}

/** Chart of accounts is edited and deleted by the admin or the accountant. */
export function canManageAccounts(roles: readonly string[]): boolean {
  return has(roles, ["admin", "accountant"]);
}

/** Any staff member edits a customer; deleting one is for the manager. */
export function canDeleteCustomers(roles: readonly string[]): boolean {
  return has(roles, MANAGER_ROLES);
}

/** Agent settlements are recorded by the manager or the accountant. */
export function canRecordSettlements(roles: readonly string[]): boolean {
  return has(roles, [...MANAGER_ROLES, "accountant"]);
}

/** Closing a box for the day: manager or teller. */
export function canCloseBoxes(roles: readonly string[]): boolean {
  return has(roles, [...MANAGER_ROLES, "teller"]);
}
