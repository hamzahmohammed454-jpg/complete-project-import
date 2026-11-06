import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resetOwnAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ password: z.string().min(8).max(72) }).parse(data))
  .handler(async ({ data, context }) => {
    const [role, unlocked, mfa] = await Promise.all([
      context.supabase.rpc("is_admin", { _user_id: context.userId }),
      context.supabase.rpc("staff_session_unlocked"),
      context.supabase.rpc("staff_mfa_satisfied"),
    ]);
    if (role.error || !role.data || unlocked.error || !unlocked.data || mfa.error || !mfa.data) throw new Error("FORBIDDEN");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (result.error) throw new Error("PASSWORD_UPDATE_FAILED");
    const audit = await context.supabase.from("activity_log").insert({ user_id: context.userId, action: "استعادة كلمة مرور المدير", target: context.userId });
    if (audit.error) throw new Error("AUDIT_FAILED");
    return { ok: true };
  });