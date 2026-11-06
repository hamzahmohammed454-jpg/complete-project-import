import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const update = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { admin: { updateUserById: update } } } }));
import { resetOwnAdminPassword } from "./password-recovery.functions";

describe("admin self recovery authorization", () => {
  for (const denied of ["is_admin", "staff_session_unlocked", "staff_mfa_satisfied"]) {
    it(`blocks when ${denied} is not satisfied`, async () => {
      update.mockClear();
      const handler = resetOwnAdminPassword as unknown as (input: unknown) => Promise<unknown>;
      await expect(handler({ data: { password: "test-only-value" }, context: { userId: "caller", supabase: { rpc: vi.fn(async (name: string) => ({ data: name !== denied, error: null })) } } })).rejects.toThrow("FORBIDDEN");
      expect(update).not.toHaveBeenCalled();
    });
  }
});