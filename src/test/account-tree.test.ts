import { describe, expect, it } from "vitest";
import { buildAccountTree } from "@/lib/account-tree";

const a = (n: number, f: number | null) => ({
  id: n, account_number: n, father_number: f, account_name: String(n), account_type: "x",
});

describe("buildAccountTree", () => {
  it("nests a child under its FatherNumber", () => {
    const tree = buildAccountTree([a(1, null), a(11, 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children[0]!.account_number).toBe(11);
  });
  it("treats an account with a missing father as a root", () => {
    expect(buildAccountTree([a(22, 2)])[0]!.account_number).toBe(22);
  });
  it("sorts siblings by account number", () => {
    const tree = buildAccountTree([a(1, null), a(13, 1), a(12, 1)]);
    expect(tree[0]!.children.map((c) => c.account_number)).toEqual([12, 13]);
  });
});
