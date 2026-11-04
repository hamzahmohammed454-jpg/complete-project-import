import { describe, expect, it } from "vitest";
import { blacklistMatch, forbiddenTextMatch, type BlacklistRow } from "@/lib/transfer-setup";

const ROWS: BlacklistRow[] = [
  { full_name: "أحمد محمد  أحمد", identity_number: "0112233445", phone_number: "0771 234 567", reason: "تحايل" },
];

describe("blacklistMatch", () => {
  it("matches the same name written with extra spaces", () => {
    expect(blacklistMatch("  أحمد   محمد أحمد ", "", "", ROWS)?.reason).toBe("تحايل");
  });
  it("matches a phone written without spaces", () => {
    expect(blacklistMatch("شخص آخر", "0771234567", "", ROWS)?.full_name).toBe("أحمد محمد  أحمد");
  });
  it("matches an identity number", () => {
    expect(blacklistMatch("شخص آخر", "", "0112233445", ROWS)?.reason).toBe("تحايل");
  });
  it("does not match an unrelated person", () => {
    expect(blacklistMatch("سالم علي", "0700000000", "999999999", ROWS)).toBeNull();
  });
  it("does not match on empty fields", () => {
    expect(blacklistMatch("", "", "", ROWS)).toBeNull();
  });
});

describe("forbiddenTextMatch", () => {
  it("finds a forbidden word inside notes", () => {
    expect(forbiddenTextMatch(["أحمد", "دفعة سلاح"], ["سلاح"])).toBe("سلاح");
  });
  it("returns null when nothing matches", () => {
    expect(forbiddenTextMatch(["نفقات دراسية"], ["سلاح"])).toBeNull();
  });
});
