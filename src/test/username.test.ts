import { describe, expect, it } from "vitest";

import { isValidUsername, usernameToEmail } from "@/lib/username";

describe("username sign-in", () => {
  it("maps a username to the same address regardless of case/spaces", () => {
    expect(usernameToEmail(" Ahmed ")).toBe("ahmed@staff.sarraf.app");
  });
  it("rejects too-short or non-latin usernames", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("أحمد")).toBe(false);
    expect(isValidUsername("ahmed_1")).toBe(true);
  });
});
