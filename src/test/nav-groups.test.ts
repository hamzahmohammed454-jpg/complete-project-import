import { describe, expect, it } from "vitest";
import { accessibleTabs, groupItems, navigationSections, NAV_GROUPS, PRIMARY_TABS, TAB_OF } from "@/lib/nav-groups";
import { screenAllowed } from "@/lib/screen-access";

describe("Navigation organization", () => {
  it("keeps six financial groups and administration separate", () => {
    expect(PRIMARY_TABS.map((tab) => tab.to)).toEqual(["/app", "/transfers", "/exchange", "/boxes", "/accounts", "/reports"]);
    expect(groupItems("/administration").map((item) => item.to)).toEqual(["/administration", "/staff", "/setup", "/backup", "/activity", "/auto-reply", "/wa-bot", "/wa-chats", "/news", "/license"]);
  });
  it("assigns each screen to exactly one group", () => {
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect(new Set(paths).size).toBe(paths.length);
    expect(TAB_OF["/vouchers"]).toBe("/accounts");
    expect(TAB_OF["/checks"]).toBe("/boxes");
    expect(TAB_OF["/journal"]).toBe("/accounts");
    expect(TAB_OF["/staff"]).toBe("/administration");
  });
  it("opens an allowed child when a group landing screen is unavailable", () => {
    const tabs = accessibleTabs((path) => screenAllowed(path, ["/statement"], ["accountant"]));
    expect(tabs.map((tab) => tab.to)).toEqual(["/app", "/statement"]);
    expect(TAB_OF[tabs[1]?.to ?? ""]).toBe("/accounts");
    expect(tabs.some((tab) => tab.to === "/staff")).toBe(false);
  });
  it("organizes accounts into the four requested sections", () => {
    expect(navigationSections("/accounts").map((section) => section.title)).toEqual(["تهيئة الحسابات", "العمليات", "تقارير", "القوائم المالية"]);
    expect(navigationSections("/accounts").find((section) => section.title === "القوائم المالية")?.items.map((item) => item.to)).toEqual(["/reports", "/financials"]);
  });
  it("puts transfer setup in the transfers menu under its own section", () => {
    const sections = navigationSections("/transfers");
    expect(sections.map((section) => section.title)).toEqual(["تهيئة الحوالات", "العمليات", "حوالات الشبكات", "تقارير", "الإجماليات"]);
    expect(sections[0]?.items.map((item) => item.to)).toEqual(["/transfer-setup"]);
    expect(TAB_OF["/transfer-setup"]).toBe("/transfers");
    expect(sections[0]?.planned).not.toContain("دليل الدول");
    expect(sections[0]?.planned).not.toContain("دليل الجهات");
    expect(screenAllowed("/transfer-setup", ["/transfer-setup"], ["teller"])).toBe(true);
    expect(screenAllowed("/transfer-setup", ["/statement"], ["teller"])).toBe(false);
  });
});