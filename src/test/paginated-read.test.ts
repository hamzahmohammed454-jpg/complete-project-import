import { expect, it } from "vitest";
import { collectPages } from "@/lib/paginated-read";
it("exports all records across the page boundary", async () => {
  const all = Array.from({ length: 1001 }, (_, i) => i);
  expect(await collectPages(async (from, until) => all.slice(from, until + 1))).toEqual(all);
});