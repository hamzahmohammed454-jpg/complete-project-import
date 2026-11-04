import { describe, expect, it } from "vitest";

import { coerceAnalysis, needsOwnerApproval, normalizePhone, parseOwnerCommand } from "./logic";

describe("normalizePhone", () => {
  it("adds Yemen code to local mobile numbers", () => {
    expect(normalizePhone("774 379 751")).toBe("967774379751");
    expect(normalizePhone("+967774379751")).toBe("967774379751");
    expect(normalizePhone("00967774379751")).toBe("967774379751");
  });
});

describe("parseOwnerCommand", () => {
  it("approves with commission", () => {
    expect(parseOwnerCommand("موافقة 12 عمولة 500")).toEqual({ kind: "approve", id: 12, commission: 500 });
  });
  it("approves with Arabic digits and no commission", () => {
    expect(parseOwnerCommand("قبول ١٢")).toEqual({ kind: "approve", id: 12, commission: null });
  });
  it("rejects with reason", () => {
    expect(parseOwnerCommand("رفض 7 الرصيد لا يكفي")).toEqual({ kind: "reject", id: 7, reason: "الرصيد لا يكفي" });
  });
  it("lists pending", () => {
    expect(parseOwnerCommand("الطلبات").kind).toBe("pending");
  });
  it("ignores free text", () => {
    expect(parseOwnerCommand("كيف الحال").kind).toBe("unknown");
  });
});

describe("coerceAnalysis", () => {
  it("falls back to other on unknown kind and drops bad amounts", () => {
    const a = coerceAnalysis({ kind: "hack", amount: "abc" });
    expect(a.kind).toBe("other");
    expect(a.amount).toBeNull();
  });
  it("reads string amounts with commas", () => {
    expect(coerceAnalysis({ kind: "deposit", amount: "150,000" }).amount).toBe(150000);
  });
});

describe("needsOwnerApproval", () => {
  it("duplicate transfer notices never go to the owner", () => {
    expect(needsOwnerApproval("transfer_notice", true)).toBe(false);
    expect(needsOwnerApproval("withdrawal", false)).toBe(true);
    expect(needsOwnerApproval("other", false)).toBe(false);
  });
});
