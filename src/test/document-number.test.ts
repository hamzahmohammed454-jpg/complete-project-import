import { expect, it } from "vitest";
import { documentNumber } from "@/lib/document-number";
it("keeps independent voucher types distinguishable even at the same sequence number", () => {
  expect(documentNumber("receipt", 1)).toBe("REC-000001");
  expect(documentNumber("payment", 1)).toBe("PAY-000001");
  expect(new Set(["receipt", "payment", "deposit", "journal", "buy", "sell", "incoming", "outgoing", "entry", "check_in", "check_out", "settlement"].map((k) => documentNumber(k, 1))).size).toBe(12);
});
it("does not present an offline temporary id as a final document number", () => {
  expect(documentNumber("receipt", "pending-abcd")).toBe("قيد المزامنة");
  expect(documentNumber("receipt", null)).toBe("قيد المزامنة");
});