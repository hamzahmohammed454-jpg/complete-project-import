import { describe, expect, it } from "vitest";
import { validateRecoveryPassword } from "./password-recovery";

describe("recovery password", () => {
  it("requires at least eight characters", () => {
    expect(validateRecoveryPassword("1234567", "1234567")).not.toBeNull();
    expect(validateRecoveryPassword("12345678", "12345678")).toBeNull();
  });
  it("requires matching confirmation", () => {
    expect(validateRecoveryPassword("12345678", "87654321")).not.toBeNull();
  });
});