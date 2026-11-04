import { describe, expect, it } from "vitest";

import { trialBalance } from "@/lib/reports";

describe("trialBalance", () => {
  it("balance is debit minus credit per account and currency", () => {
    const lines = trialBalance([
      { account_id: 1, currency_id: 3, side: "مدين", amount: 100 },
      { account_id: 1, currency_id: 3, side: "دائن", amount: 30 },
      { account_id: 1, currency_id: 1, side: "دائن", amount: 50 },
    ]);
    expect(lines.find((l) => l.currency_id === 3)?.balance).toBe(70);
    expect(lines.find((l) => l.currency_id === 1)?.balance).toBe(-50);
  });
});
