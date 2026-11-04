import { describe, expect, it } from "vitest";

import { SCREENS } from "@/lib/screen-access";
import { PERMISSION_TREE, defaultRow, groupEffectiveRow, isOn, setAll, setKey, stateOf, userEffectiveRow } from "@/lib/permission-tree";

describe("permission tree", () => {
  it("lists every system screen exactly once", () => {
    const paths = PERMISSION_TREE.flatMap((s) => s.screens);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths].sort()).toEqual(SCREENS.map((s) => s.to).sort());
  });

  it("turning view off turns every action off", () => {
    const row = setKey(defaultRow("/transfers", []), "view", false);
    expect(isOn(row, "create")).toBe(false);
    expect(isOn(row, "x:deliver")).toBe(false);
  });

  it("granting one action also grants view", () => {
    const row = setKey(setAll(defaultRow("/checks", []), false), "x:collect", true);
    expect(row.can_view).toBe(true);
    expect(isOn(row, "x:collect")).toBe(true);
    expect(isOn(row, "x:bounce")).toBe(false);
    expect(isOn(row, "delete")).toBe(false);
  });

  it("folder state is all, none or partial", () => {
    const on = defaultRow("/boxes", []);
    const off = setAll(defaultRow("/journal", []), false);
    expect(stateOf([on])).toBe("all");
    expect(stateOf([off])).toBe("none");
    expect(stateOf([on, off])).toBe("some");
  });

  it("screens outside a restricted group start off", () => {
    expect(isOn(defaultRow("/boxes", ["/transfers"]), "view")).toBe(false);
    expect(isOn(defaultRow("/transfers", ["/transfers"]), "view")).toBe(true);
  });

  it("employee without a group may use every screen", () => {
    expect(isOn(groupEffectiveRow("/transfers", []), "x:cancel")).toBe(true);
  });

  it("any one of the employee's groups allowing an action is enough", () => {
    const noDelete = { allowed_screens: [], rows: [setKey(defaultRow("/transfers", []), "delete", false)] };
    const onlyBoxes = { allowed_screens: ["/boxes"], rows: [] };
    expect(isOn(groupEffectiveRow("/transfers", [noDelete]), "delete")).toBe(false);
    expect(isOn(groupEffectiveRow("/transfers", [noDelete, { allowed_screens: [], rows: [] }]), "delete")).toBe(true);
    expect(isOn(groupEffectiveRow("/transfers", [onlyBoxes]), "view")).toBe(false);
  });

  it("an employee's own permission replaces the group result for that screen only", () => {
    const group = [{ allowed_screens: [], rows: [] }];
    const personal = [setKey(defaultRow("/transfers", []), "x:cancel", false)];
    expect(isOn(userEffectiveRow("/transfers", personal, group), "x:cancel")).toBe(false);
    expect(isOn(userEffectiveRow("/transfers", personal, group), "x:deliver")).toBe(true);
    expect(isOn(userEffectiveRow("/boxes", personal, group), "delete")).toBe(true);
  });

  it("an employee's own permission can open a screen the group closes", () => {
    const group = [{ allowed_screens: ["/boxes"], rows: [] }];
    const personal = [setAll(defaultRow("/exchange", []), true)];
    expect(isOn(userEffectiveRow("/exchange", personal, group), "create")).toBe(true);
    expect(isOn(userEffectiveRow("/transfers", personal, group), "view")).toBe(false);
  });
});
