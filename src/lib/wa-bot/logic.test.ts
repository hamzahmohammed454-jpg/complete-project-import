import { describe, expect, it } from "vitest";

import { botGate, canOpenForPosting, coerceAnalysis, matchCurrencyId, suggestedDirection, customerKindAllowed, needsOwnerApproval, normalizePhone, parseOwnerCommand, routeToOwners, withinServiceWindow } from "./logic";

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

const base = { enabled: true, exchangers_enabled: true, customers_enabled: true, owners_enabled: true, customer_kinds: ["deposit", "withdrawal"] };

describe("bot controls", () => {
  it("global switch pauses everyone", () => {
    expect(botGate({ ...base, enabled: false }, "owner")).toBe("paused");
  });
  it("disabling customers leaves exchangers working", () => {
    const s = { ...base, customers_enabled: false };
    expect(botGate(s, "customer")).toBe("paused");
    expect(botGate(s, "exchanger")).toBe("ok");
  });
  it("customers can only send enabled request kinds", () => {
    expect(customerKindAllowed(base, "customer", "transfer")).toBe(false);
    expect(customerKindAllowed(base, "customer", "deposit")).toBe(true);
    expect(customerKindAllowed(base, "exchanger", "transfer_notice")).toBe(true);
  });
  it("routes each kind to its assigned owners, else to all owners", () => {
    const owners = [{ id: 1, notify_kinds: ["withdrawal"] }, { id: 2, notify_kinds: ["transfer_notice"] }];
    expect(routeToOwners(owners, "withdrawal").map((o) => o.id)).toEqual([1]);
    expect(routeToOwners(owners, "deposit").map((o) => o.id)).toEqual([1, 2]);
  });
});

describe("withinServiceWindow", () => {
  const now = Date.parse("2026-11-04T20:00:00Z");
  it("allows replies within 24 hours of the customer's last message", () => {
    expect(withinServiceWindow("2026-11-03T21:00:00Z", now)).toBe(true);
  });
  it("blocks free replies after 24 hours or with no inbound message", () => {
    expect(withinServiceWindow("2026-11-03T19:59:00Z", now)).toBe(false);
    expect(withinServiceWindow(null, now)).toBe(false);
  });
});

describe("فتح طلب البوت للحفظ", () => {
  it("طلب إرسال حوالة يُفتح صادرة، وإشعار الصراف يُفتح واردة", () => {
    expect(suggestedDirection("transfer")).toBe("outgoing");
    expect(suggestedDirection("transfer_notice")).toBe("incoming");
    expect(suggestedDirection("deposit")).toBeNull();
  });
  it("لا يُفتح للحفظ مرة ثانية بعد ربطه بحوالة", () => {
    expect(canOpenForPosting({ kind: "transfer", status: "pending", posted_id: null })).toBe(true);
    expect(canOpenForPosting({ kind: "transfer", status: "approved", posted_id: 15 })).toBe(false);
  });
  it("لا يُفتح الطلب المكرر أو المرفوض", () => {
    expect(canOpenForPosting({ kind: "transfer_notice", status: "duplicate", posted_id: null })).toBe(false);
    expect(canOpenForPosting({ kind: "transfer_notice", status: "rejected", posted_id: null })).toBe(false);
  });
  it("يطابق العملة بالاسم ولا يخمّن عند الغموض", () => {
    const cur = [{ id: 1, currency_name: "ريال يمني" }, { id: 2, currency_name: "ريال سعودي" }, { id: 3, currency_name: "دولار أمريكي" }];
    expect(matchCurrencyId("دولار", cur)).toBe(3);
    expect(matchCurrencyId("USD", cur)).toBe(3);
    expect(matchCurrencyId("سعودي", cur)).toBe(2);
    expect(matchCurrencyId("ريال يمني", cur)).toBe(1);
    expect(matchCurrencyId("ريال", cur)).toBeNull();
    expect(matchCurrencyId(null, cur)).toBeNull();
  });
});
