import { describe, expect, it } from "vitest";
import { permits, type ScreenPermission } from "@/lib/permissions";
const viewOnly: ScreenPermission = { screen_path: "/transfers", can_view: true, can_create: false, can_update: false, can_delete: false, can_print: false };
describe("Detailed staff permissions", () => {
  it("permits viewing without allowing creation", () => { expect(permits("view", [viewOnly])).toBe(true); expect(permits("create", [viewOnly])).toBe(false); });
  it("does not permit actions when viewing is denied", () => { expect(permits("create", [{ ...viewOnly, can_view: false, can_create: true }])).toBe(false); });
  it("combines grants from several groups", () => { expect(permits("print", [viewOnly, { ...viewOnly, can_print: true }])).toBe(true); });
});describe("Per-button permissions", () => {
  const base: ScreenPermission = { screen_path: "/transfers", can_view: true, can_create: true, can_update: true, can_delete: true, can_print: true };
  it("allows a button the group never configured", () => { expect(permits("deliver", [base])).toBe(true); });
  it("blocks a button that was unchecked", () => { expect(permits("cancel", [{ ...base, extra_actions: { cancel: false } }])).toBe(false); });
  it("blocks every button when viewing is denied", () => { expect(permits("deliver", [{ ...base, can_view: false, extra_actions: { deliver: true } }])).toBe(false); });
});
