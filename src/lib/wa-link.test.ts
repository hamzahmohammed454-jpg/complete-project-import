import { describe, expect, it } from "vitest";
import { normalizeYemenPhone } from "./wa-link";

describe("normalizeYemenPhone", () => {
  it("adds 967 to a local 9-digit number", () => expect(normalizeYemenPhone("774379751")).toBe("967774379751"));
  it("strips leading 00", () => expect(normalizeYemenPhone("00967774379751")).toBe("967774379751"));
  it("rejects short input", () => expect(normalizeYemenPhone("123")).toBeNull());
});
