import { describe, expect, it } from "vitest";

import { screenAllowed, visibleTabs } from "@/lib/screen-access";

describe("Screen access from staff groups", () => {
  it("keeps activation admin-only even when a staff group explicitly grants the screen", () => {
    expect(screenAllowed("/license", [], ["accountant"])).toBe(false);
    expect(screenAllowed("/license", ["/license"], ["manager"])).toBe(false);
    expect(screenAllowed("/license", ["/license"], ["teller"])).toBe(false);
    expect(screenAllowed("/license", [], ["admin"])).toBe(true);
  });
  it("shows everything to the system admin even when the group is restricted", () => {
    expect(screenAllowed("/staff", ["/transfers"], ["admin"])).toBe(true);
  });

  it("shows everything when the staff member is in no restricting group", () => {
    expect(screenAllowed("/setup", [], ["teller"])).toBe(true);
  });

  it("shows only the screens the group was given", () => {
    expect(screenAllowed("/transfers", ["/transfers", "/boxes"], ["teller"])).toBe(true);
    expect(screenAllowed("/staff", ["/transfers", "/boxes"], ["teller"])).toBe(false);
  });

  it("unions the screens of several groups", () => {
    expect(screenAllowed("/commissions", ["/transfers", "/commissions"], ["teller"])).toBe(true);
  });

  it("keeps every tab when the restriction would leave none", () => {
    const tabs = [{ to: "/app" }, { to: "/transfers" }];
    expect(visibleTabs(tabs, ["/setup"], ["teller"])).toEqual(tabs);
    expect(visibleTabs(tabs, ["/transfers"], ["teller"])).toEqual([{ to: "/transfers" }]);
  });
});
