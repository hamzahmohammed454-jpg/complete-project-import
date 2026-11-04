import { describe, expect, it } from "vitest";
import { voucherScreenType } from "@/lib/voucher-screen";

describe("separate voucher operations", () => {
  it("opens only receipt for the receipt item", () => {
    expect(voucherScreenType("receipt")).toBe("قبض");
  });
  it("opens only payment for the payment item", () => {
    expect(voucherScreenType("payment")).toBe("صرف");
  });
  it("opens deposit independently", () => {
    expect(voucherScreenType("deposit")).toBe("إيداع");
  });
});