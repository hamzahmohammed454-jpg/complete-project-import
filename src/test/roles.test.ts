import { describe, expect, it } from "vitest";

import { deleteErrorMessage } from "@/lib/crud-errors";
import { canDeleteCustomers, canManageAccounts, canManageCommissions, isAdmin } from "@/lib/roles";

describe("canManageCommissions", () => {
  it("allows the manager and the admin", () => {
    expect(canManageCommissions(["manager"])).toBe(true);
    expect(canManageCommissions(["admin"])).toBe(true);
    expect(canManageCommissions(["teller", "admin"])).toBe(true);
  });

  it("denies teller, accountant and staff with no role", () => {
    expect(canManageCommissions([])).toBe(false);
    expect(canManageCommissions(["teller"])).toBe(false);
    expect(canManageCommissions(["accountant"])).toBe(false);
  });
});

describe("delete / edit permissions", () => {
  it("only the manager or admin deletes a customer", () => {
    expect(canDeleteCustomers(["manager"])).toBe(true);
    expect(canDeleteCustomers(["admin"])).toBe(true);
    expect(canDeleteCustomers(["teller"])).toBe(false);
    expect(canDeleteCustomers(["accountant"])).toBe(false);
  });

  it("the chart of accounts is edited by the admin or the accountant", () => {
    expect(canManageAccounts(["accountant"])).toBe(true);
    expect(canManageAccounts(["admin"])).toBe(true);
    expect(canManageAccounts(["manager"])).toBe(false);
    expect(canManageAccounts(["teller"])).toBe(false);
  });

  it("currencies are edited by the system admin only", () => {
    expect(isAdmin(["admin"])).toBe(true);
    expect(isAdmin(["manager"])).toBe(false);
  });
});

describe("deleteErrorMessage", () => {
  it("explains a record that has operations", () => {
    expect(deleteErrorMessage({ code: "23503", message: "fk" })).toBe("لا يمكن الحذف — عليه عمليات مسجّلة");
    expect(deleteErrorMessage({ code: "P0001", message: "IN_USE" })).toBe("لا يمكن الحذف — عليه عمليات مسجّلة");
  });

  it("explains a parent account and missing permission", () => {
    expect(deleteErrorMessage({ message: "HAS_CHILDREN" })).toBe("لا يمكن الحذف — تحته حسابات فرعية");
    expect(deleteErrorMessage(new Error("NO_PERMISSION"))).toBe("لا تملك صلاحية الحذف");
  });
});
