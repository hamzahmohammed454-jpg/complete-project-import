import { describe, expect, it } from "vitest";
import { computeCommission, findRule, type CommissionRule } from "@/lib/commission";

const base: CommissionRule = {
  id: 1, document_type: "outgoing", currency_id: null, agent_id: null,
  amount_from: null, amount_to: null, method: "percent", commission_value: 1,
  min_commission: null, max_commission: null,
};

describe("commission engine", () => {
  it("percent rule takes a share of the amount", () => {
    expect(computeCommission(base, 5000)).toBe(50);
  });
  it("fixed rule ignores the amount", () => {
    expect(computeCommission({ ...base, method: "fixed", commission_value: 300 }, 90000)).toBe(300);
  });
  it("clamps to minimum and maximum", () => {
    const r = { ...base, min_commission: 100, max_commission: 1000 };
    expect(computeCommission(r, 1000)).toBe(100);
    expect(computeCommission(r, 500000)).toBe(1000);
  });
  it("agent-specific rule wins over generic", () => {
    const rules = [base, { ...base, id: 2, agent_id: 7, commission_value: 0.5 }];
    expect(findRule(rules, { documentType: "outgoing", amount: 100, currencyId: 1, agentId: 7 })?.id).toBe(2);
    expect(findRule(rules, { documentType: "outgoing", amount: 100, currencyId: 1, agentId: 3 })?.id).toBe(1);
  });
  it("respects amount range and document type", () => {
    const rules = [{ ...base, amount_from: 1000, amount_to: 5000 }];
    expect(findRule(rules, { documentType: "outgoing", amount: 6000, currencyId: null, agentId: null })).toBeNull();
    expect(findRule(rules, { documentType: "incoming", amount: 2000, currencyId: null, agentId: null })).toBeNull();
  });
});
