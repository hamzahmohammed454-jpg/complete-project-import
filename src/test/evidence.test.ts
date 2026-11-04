import { describe, expect, it } from "vitest";
import { evidenceIsValid } from "@/lib/evidence";
describe("private transfer evidence", () => {
  it("accepts supported photo formats", () => { expect(evidenceIsValid({ type: "image/jpeg", size: 2048 })).toBe(true); });
  it("rejects executable or SVG content", () => { expect(evidenceIsValid({ type: "image/svg+xml", size: 2048 })).toBe(false); });
  it("rejects photos above the storage limit", () => { expect(evidenceIsValid({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe(false); });
});