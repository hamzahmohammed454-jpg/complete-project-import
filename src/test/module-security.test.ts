import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("src/test/fixtures/0060_harden_new_module_access.sql", "utf8");

describe("new module security boundaries", () => {
  it("requires a real staff role rather than authentication alone", () => {
    expect(sql).toContain("FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','manager','accountant','teller')");
    expect(sql).toContain("auth.uid() IS NOT NULL AND public.staff_active()");
  });
  it("keeps probe records inaccessible to app users", () => {
    expect(sql).toContain("ALTER TABLE public.zz_probe ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.zz_probe FROM PUBLIC,anon,authenticated");
  });
  it("requires licensed action permission for module writes", () => {
    expect(sql).toContain("public.license_writes_allowed() AND public.has_screen_permission(%L,''create'')");
    expect(sql).toContain("public.license_writes_allowed() AND public.has_screen_permission(%L,''update'')");
  });
  it("protects privileged decisions with manager, session and action checks", () => {
    expect(sql).toContain("PERFORM public.require_staff_session()");
    expect(sql).toContain("public.has_role(auth.uid(),'manager')");
    expect(sql).toContain("public.has_screen_permission(screen,'update')");
    expect(sql).toContain("BEFORE UPDATE ON public.transfer_requests");
    expect(sql).toContain("BEFORE UPDATE ON public.withdrawal_requests");
  });
});