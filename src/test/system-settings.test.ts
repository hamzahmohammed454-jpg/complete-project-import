import { describe, it, expect } from "vitest";
import { resolveSetting, transferRuleError, exchangeRuleError, type SettingRow } from "@/lib/system-settings";

const rows: SettingRow[] = [
  { scope: "branch", owner: "all", key: "trf.req_sender_phone", value: true },
  { scope: "branch", owner: "2", key: "gen.idle_minutes", value: 10 },
  { scope: "user", owner: "u1", key: "gen.idle_minutes", value: 5 },
];
describe("system settings", () => {
  it("user overrides branch overrides all-branches overrides default", () => {
    expect(resolveSetting("gen.idle_minutes", rows, { branchId: 1 })).toBe(30);
    expect(resolveSetting("gen.idle_minutes", rows, { branchId: 2 })).toBe(10);
    expect(resolveSetting("gen.idle_minutes", rows, { branchId: 2, userId: "u1" })).toBe(5);
  });
  const get = (over: Record<string, unknown>) => (k: string) => (k in over ? over[k] : resolveSetting(k, [], {})) as never;
  const base = { sender: "علي احمد", sender_phone: "", receiver: "محمد صالح", receiver_phone: "", amount: 100, notes: "" };
  it("requires sender phone when enabled", () => {
    expect(transferRuleError(get({ "trf.req_sender_phone": true }), base, "outgoing")).toContain("هاتف المرسل");
  });
  it("phone must be 9 digits", () => {
    expect(transferRuleError(get({ "trf.phone9": true }), { ...base, sender_phone: "7712" }, "outgoing")).toContain("9");
    expect(transferRuleError(get({ "trf.phone9": true }), { ...base, sender_phone: "771234567" }, "outgoing")).toBeNull();
  });
  it("names need 3 words", () => {
    expect(transferRuleError(get({ "trf.names3": true }), base, "outgoing")).toContain("3");
  });
  it("notes required above limit", () => {
    expect(transferRuleError(get({ "trf.notes_required_above": 50 }), base, "outgoing")).toContain("50");
  });
  it("cash buy/sell needs customer name when enabled", () => {
    expect(exchangeRuleError(get({ "exc.req_cash_customer": true }), "cash", "")).not.toBeNull();
    expect(exchangeRuleError(get({ "exc.req_cash_customer": true }), "account", "")).toBeNull();
  });
});
