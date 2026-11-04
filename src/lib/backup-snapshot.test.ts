import { describe, expect, it } from "vitest";
import { buildSnapshot, verifySnapshot } from "./backup-snapshot";

const tables = [{ table: "boxes", rows: [{ id: 1, name: "رئيسي" }, { id: 2, name: "فرعي" }] }];

describe("backup snapshot", () => {
  it("verifies an untouched snapshot with no problems", async () => {
    const s = await buildSnapshot(tables, "2026-11-01");
    const r = await verifySnapshot(JSON.stringify(s));
    expect(r.ok && r.problems).toEqual([]);
  });
  it("detects a tampered amount", async () => {
    const s = await buildSnapshot(tables, "2026-11-01");
    s.tables["boxes"]![0]!["name"] = "x";
    const r = await verifySnapshot(JSON.stringify(s));
    expect(r.ok && r.problems.length).toBe(1);
  });
  it("detects a missing row", async () => {
    const s = await buildSnapshot(tables, "2026-11-01");
    s.tables["boxes"]!.pop();
    const r = await verifySnapshot(JSON.stringify(s));
    expect(r.ok && r.problems.length).toBe(2);
  });
  it("rejects a non-snapshot file", async () => {
    expect((await verifySnapshot("{}")).ok).toBe(false);
  });
});
