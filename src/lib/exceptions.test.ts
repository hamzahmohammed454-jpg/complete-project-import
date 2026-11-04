import { describe, expect, it } from "vitest";
import { agentReconciliation, staleTransfers, type OpenTransfer } from "./exceptions";

const t = (p: Partial<OpenTransfer>): OpenTransfer => ({ id: 1, dir: "in", the_date: "2026-11-01", amount: 100, currency_id: 1, agent_id: 5, transfer_number: 1, receiver_name: null, ...p });

describe("exceptions", () => {
  it("flags only transfers open longer than the limit, oldest first", () => {
    const r = staleTransfers([t({ id: 1, the_date: "2026-10-30" }), t({ id: 2, the_date: "2026-10-20" }), t({ id: 3, the_date: "2026-10-29" })], "2026-11-01", 2);
    expect(r.map((x) => x.id)).toEqual([2, 3]);
  });
  it("sums agent open transfers per currency separately and skips rows without agent", () => {
    const r = agentReconciliation([
      t({ dir: "out", amount: 100 }), t({ dir: "out", amount: 50 }), t({ dir: "in", amount: 30 }),
      t({ currency_id: 2, amount: 7 }), t({ agent_id: null, amount: 999 }),
    ]);
    expect(r).toEqual([
      { agentId: 5, currencyId: 1, outCount: 2, outAmount: 150, inCount: 1, inAmount: 30 },
      { agentId: 5, currencyId: 2, outCount: 0, outAmount: 0, inCount: 1, inAmount: 7 },
    ]);
  });
});
