import { describe, expect, it } from "vitest";
import { cashPosition } from "./cash-position";

describe("cashPosition", () => {
  it("keeps each currency separate and flags shortage when pending payouts exceed cash", () => {
    const r = cashPosition(
      [
        { currency_id: 1, amount: 1000, movement_type: "قبض" },
        { currency_id: 1, amount: 300, movement_type: "صرف" },
        { currency_id: 2, amount: 50, movement_type: "قبض" },
      ],
      [{ currency_id: 2, amount: 80 }, { currency_id: 1, amount: 200 }],
    );
    const c1 = r.find((p) => p.currencyId === 1)!;
    const c2 = r.find((p) => p.currencyId === 2)!;
    expect(c1).toMatchObject({ cash: 700, pending: 200, after: 500, short: false });
    expect(c2).toMatchObject({ cash: 50, pending: 80, after: -30, short: true, pendingCount: 1 });
  });
});
