import type { DetailRow } from "@/lib/reports";

export type ChartAccount = { id: number; account_number: number; father_number: number | null; account_name: string };
export type Section = "assets" | "liabilities" | "equity" | "revenue" | "expenses";

const ROOT_SECTION: Record<number, Section> = { 1: "assets", 2: "liabilities", 3: "equity", 4: "revenue", 5: "expenses" };

/** Finds the top-level group (1..5) of an account by walking father_number links. */
export function sectionOf(acc: ChartAccount, byNumber: Map<number, ChartAccount>): Section | null {
  let cur: ChartAccount | undefined = acc;
  for (let i = 0; cur && i < 20; i++) {
    if (cur.father_number == null) return ROOT_SECTION[cur.account_number] ?? null;
    cur = byNumber.get(cur.father_number);
  }
  return null;
}

export type StatementLine = { account_id: number; name: string; amount: number };
export type Statements = {
  sections: Record<Section, StatementLine[]>;
  totals: Record<Section, number>;
  netProfit: number;
};

/**
 * Builds income statement and balance sheet for one currency.
 * Debit-nature (assets, expenses) amount = debit − credit; credit-nature = credit − debit.
 * Net profit = revenue − expenses and is added to equity in the balance sheet.
 */
export function buildStatements(accounts: readonly ChartAccount[], rows: readonly DetailRow[], currencyId: number): Statements {
  const byNumber = new Map(accounts.map((a) => [a.account_number, a]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines = new Map<number, StatementLine & { section: Section }>();
  for (const r of rows) {
    if (r.account_id == null || (r.currency_id ?? 0) !== currencyId) continue;
    const acc = byId.get(r.account_id);
    if (!acc) continue;
    const section = sectionOf(acc, byNumber);
    if (!section) continue;
    const debitNature = section === "assets" || section === "expenses";
    const isDebit = r.side === "مدين" || r.side === "debit";
    const signed = Number(r.amount) * (isDebit === debitNature ? 1 : -1);
    const line = lines.get(acc.id) ?? { account_id: acc.id, name: `${acc.account_number} ${acc.account_name}`, amount: 0, section };
    line.amount += signed;
    lines.set(acc.id, line);
  }
  const sections: Record<Section, StatementLine[]> = { assets: [], liabilities: [], equity: [], revenue: [], expenses: [] };
  const totals: Record<Section, number> = { assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0 };
  for (const l of lines.values()) {
    if (Math.abs(l.amount) < 1e-9) continue;
    sections[l.section].push({ account_id: l.account_id, name: l.name, amount: l.amount });
    totals[l.section] += l.amount;
  }
  for (const s of Object.values(sections)) s.sort((a, b) => a.name.localeCompare(b.name));
  return { sections, totals, netProfit: totals.revenue - totals.expenses };
}
