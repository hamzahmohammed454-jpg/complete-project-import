import { expect, it } from "vitest";
import { previewCustomerImport } from "@/lib/customer-import";
it("imports contact fields only, never numbers or opening balances", () => {
  const [row] = previewCustomerImport([["الاسم", "الهاتف", "الرصيد", "رقم العميل"], ["أحمد", "0771234567", 999, 50]], ["ref"]);
  expect(row).toEqual({ row: 2, full_name: "أحمد", phone_number: "0771234567", client_ref: "ref", issues: [], warnings: [] });
});
it("keeps text phone zeroes and warns when Excel stored a numeric phone", () => {
  const rows = previewCustomerImport([["name", "phone"], ["أ", "٠٧٧١٢٣٤٥٦٧"], ["ب", 771234568]], ["a", "b"]);
  expect(rows[0]?.phone_number).toBe("0771234567");
  expect(rows[0]?.warnings).toHaveLength(0);
  expect(rows[1]?.warnings).toHaveLength(1);
});
it("rejects duplicated phones and missing names but does not declare names unique", () => {
  const rows = previewCustomerImport([["الاسم", "الهاتف"], ["أ", "0771234567"], ["أ", "0771234568"], ["", "0771234567"]], ["a", "b", "c"]);
  expect(rows[1]?.issues).toEqual([]);
  expect(rows[2]?.issues).toHaveLength(2);
  expect(() => previewCustomerImport([["الرصيد"]], [])).toThrow();
});