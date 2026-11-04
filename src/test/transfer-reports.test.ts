import { describe, expect, it } from "vitest";

import { ageDays, dateDiffers, duplicateGroups, missingNumbers, totalsBy, type ReportRow } from "@/lib/transfer-reports";

const row = (p: Partial<ReportRow>): ReportRow => ({
  dir: "outgoing", id: 1, document_number: 1, the_date: "2026-10-01", created_at: "2026-10-01T08:00:00Z",
  amount: 100, currency_id: 1, sender_name: "أحمد", receiver_name: "علي", delivered: false, canceled: false, ...p,
});

describe("transfer reports", () => {
  it("lists missing document numbers between the smallest and largest", () => {
    expect(missingNumbers([1, 2, 5, null, 7])).toEqual([3, 4, 6]);
  });

  it("groups duplicates by sender, receiver, amount, currency and day, ignoring canceled", () => {
    const groups = duplicateGroups([row({ id: 1 }), row({ id: 2, sender_name: " أحمد " }), row({ id: 3, canceled: true }), row({ id: 4, amount: 50 })]);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[1, 2]]);
  });

  it("measures age until delivery, or until today when still pending", () => {
    expect(ageDays({ the_date: "2026-10-01", delivered_at: "2026-10-04T09:00:00Z" })).toBe(3);
    expect(ageDays({ the_date: "2026-10-01", delivered_at: null }, "2026-10-11")).toBe(10);
  });

  it("flags a transfer whose written date differs from its entry day", () => {
    expect(dateDiffers({ the_date: "2026-10-01", created_at: "2026-10-03T08:00:00Z" })).toBe(true);
    expect(dateDiffers({ the_date: "2026-10-01", created_at: "2026-10-01T08:00:00Z" })).toBe(false);
  });

  it("totals per currency and day, excluding canceled transfers", () => {
    const t = totalsBy([row({ amount: 100 }), row({ amount: 50 }), row({ amount: 70, canceled: true }), row({ the_date: "2026-10-02", amount: 30 })], true);
    expect(t).toEqual([
      { day: "2026-10-02", currency_id: 1, count: 1, amount: 30 },
      { day: "2026-10-01", currency_id: 1, count: 2, amount: 150 },
    ]);
  });
});
