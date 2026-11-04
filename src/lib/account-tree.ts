export type FlatAccount = {
  id: number;
  account_number: number;
  father_number: number | null;
  account_name: string;
  account_type: string;
  group_id?: number | null;
  group_name?: string | null;
  ceiling_amount?: number | null;
  ceiling_currency_id?: number | null;
};

export type AccountNode = FlatAccount & { children: AccountNode[] };

/** Builds the chart of accounts from FatherNumber links, like tblAccounts. */
export function buildAccountTree(rows: FlatAccount[]): AccountNode[] {
  const byNumber = new Map<number, AccountNode>();
  for (const r of rows) byNumber.set(r.account_number, { ...r, children: [] });
  const roots: AccountNode[] = [];
  for (const node of byNumber.values()) {
    const parent = node.father_number != null ? byNumber.get(node.father_number) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: AccountNode[]) => {
    list.sort((a, b) => a.account_number - b.account_number);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
