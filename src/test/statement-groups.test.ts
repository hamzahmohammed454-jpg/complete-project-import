import { describe, expect, it } from "vitest";
import { accountsInStatementGroup, partiesInStatementGroup, type GroupAccount } from "@/lib/statement-groups";

const accounts: GroupAccount[] = [
  { id: 1, account_number: 1, father_number: null, account_name: "أ", account_type: "رئيسي", group_id: 7 },
  { id: 2, account_number: 11, father_number: 1, account_name: "ب", account_type: "فرعي", group_id: 8 },
  { id: 3, account_number: 12, father_number: 1, account_name: "ج", account_type: "فرعي", group_id: null },
];
describe("مجموعات كشف الحساب", () => {
  it("اختيار المجموعة يعرض حساباتها فقط دون حسابات مجموعة أخرى أو حسابات بلا مجموعة", () => {
    expect(accountsInStatementGroup(accounts, 7).map((a) => a.id)).toEqual([1]);
    expect(accountsInStatementGroup(accounts, 8).map((a) => a.id)).toEqual([2]);
    expect(accountsInStatementGroup(accounts, 99)).toEqual([]);
  });
  it("إضافة حساب للمجموعة تظهره مباشرة ضمن حساباتها", () => {
    expect(accountsInStatementGroup([...accounts, { ...accounts[2], id: 4, group_id: 7 } as GroupAccount], 7).map((a) => a.id)).toEqual([1, 4]);
  });
  it("التقارير تقتصر على الأطراف المرتبطة بحسابات المجموعة المختارة", () => {
    const parties = [{ id: 20, account_id: 1 }, { id: 21, account_id: 2 }, { id: 22, account_id: null }];
    expect(partiesInStatementGroup(parties, accounts, 7).map((p) => p.id)).toEqual([20]);
    expect(partiesInStatementGroup(parties, accounts, null)).toEqual(parties);
  });
});