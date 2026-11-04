export type GroupAccount = { id: number; account_number: number; father_number: number | null; account_name: string; account_type: string; group_id: number | null };

/** A group's explicitly assigned chart accounts; never infer membership from names or parents. */
export function accountsInStatementGroup(accounts: readonly GroupAccount[], groupId: number | null): GroupAccount[] {
  return accounts.filter((a) => groupId === null || a.group_id === groupId);
}

export function partiesInStatementGroup<T extends { account_id: number | null }>(parties: readonly T[], accounts: readonly GroupAccount[], groupId: number | null): T[] {
  if (groupId === null) return [...parties];
  const ids = new Set(accountsInStatementGroup(accounts, groupId).map((a) => a.id));
  return parties.filter((p) => p.account_id !== null && ids.has(p.account_id));
}