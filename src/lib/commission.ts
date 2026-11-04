export type CommissionRule = {
  id: number;
  document_type: string;
  currency_id: number | null;
  agent_id: number | null;
  amount_from: number | null;
  amount_to: number | null;
  method: string; // "percent" | "fixed"
  commission_value: number;
  min_commission: number | null;
  max_commission: number | null;
};

export type CommissionInput = {
  documentType: string;
  amount: number;
  currencyId: number | null;
  agentId: number | null;
};

/** Picks the most specific matching rule (agent + currency beat generic) and returns the commission. */
export function findRule(rules: CommissionRule[], input: CommissionInput): CommissionRule | null {
  const matches = rules.filter(
    (r) =>
      r.document_type === input.documentType &&
      (r.currency_id == null || r.currency_id === input.currencyId) &&
      (r.agent_id == null || r.agent_id === input.agentId) &&
      (r.amount_from == null || input.amount >= Number(r.amount_from)) &&
      (r.amount_to == null || input.amount <= Number(r.amount_to)),
  );
  const score = (r: CommissionRule) => (r.agent_id != null ? 2 : 0) + (r.currency_id != null ? 1 : 0);
  matches.sort((a, b) => score(b) - score(a));
  return matches[0] ?? null;
}

export function computeCommission(rule: CommissionRule, amount: number): number {
  let c = rule.method === "percent" ? (amount * Number(rule.commission_value)) / 100 : Number(rule.commission_value);
  if (rule.min_commission != null) c = Math.max(c, Number(rule.min_commission));
  if (rule.max_commission != null) c = Math.min(c, Number(rule.max_commission));
  return Math.round(c * 100) / 100;
}
