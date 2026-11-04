import { describe, expect, it } from "vitest";
import { isMainCenter, MAIN_CENTER } from "@/lib/internal-transfer";

describe("Single internal branch destination", () => {
  it("routes the main center as internal", () => {
    expect(MAIN_CENTER).toBe("المركز الرئيسي");
    expect(isMainCenter(" المركز الرئيسي ")).toBe(true);
  });
  it("does not route another destination as internal", () => {
    expect(isMainCenter("جهة خارجية")).toBe(false);
    expect(isMainCenter("")).toBe(false);
  });
});