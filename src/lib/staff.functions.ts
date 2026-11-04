import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { usernameToEmail } from "@/lib/username";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30),
  branch_name: z.string().trim().max(100),
  role: z.enum(["admin", "manager", "teller", "accountant"]),
  enforce_box: z.boolean().default(false),
  enforce_currency: z.boolean().default(false),
  allow_past_date: z.boolean().default(true),
  allow_future_date: z.boolean().default(true),
  allow_buy: z.boolean().default(true),
  allow_sell: z.boolean().default(true),
  branch_id: z.number().int().positive().nullable().optional(),
  box_id: z.number().int().positive().nullable().optional(),
  currency_id: z.number().int().positive().nullable().optional(),
});

/** Admin creates a staff account that can sign in immediately with the given password. */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (roleError || !isAdmin) throw new Error("FORBIDDEN");
    const [session, mfa] = await Promise.all([context.supabase.rpc("staff_session_unlocked"), context.supabase.rpc("staff_mfa_satisfied")]);
    if (session.error || mfa.error || !session.data || !mfa.data) throw new Error("FORBIDDEN");
    if (data.enforce_box && !data.box_id) throw new Error("ASSIGNED_BOX_REQUIRED");
    if (data.enforce_currency && !data.currency_id) throw new Error("ASSIGNED_CURRENCY_REQUIRED");
    if (data.box_id && data.branch_id) {
      const { data: box, error } = await context.supabase.from("boxes").select("branch_id").eq("id", data.box_id).single();
      if (error || box.branch_id !== data.branch_id) throw new Error("BOX_BRANCH_MISMATCH");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone, username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message.includes("already") ? "EXISTS" : "FAILED");
    const id = created.user.id;
    try {
      const profile = await supabaseAdmin.from("profiles").update({ username: data.username, full_name: data.full_name, phone: data.phone, branch_name: data.branch_name }).eq("id", id).select("id").single();
      if (profile.error) throw profile.error;
      const role = await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });
      if (role.error) throw role.error;
      const defaults = await context.supabase.from("staff_work_defaults").insert({ user_id: id, enforce_box: data.enforce_box, enforce_currency: data.enforce_currency, allow_past_date: data.allow_past_date, allow_future_date: data.allow_future_date, allow_buy: data.allow_buy, allow_sell: data.allow_sell, branch_id: data.branch_id ?? null, box_id: data.box_id ?? null, currency_id: data.currency_id ?? null });
      if (defaults.error) throw defaults.error;
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(id);
      throw new Error("FAILED");
    }
    return { id };
  });

export const updateStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), full_name: z.string().trim().min(2).max(100), phone: z.string().trim().max(30), branch_name: z.string().trim().max(100), password: z.string().min(8).max(72).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (error || !admin) throw new Error("FORBIDDEN");
    const [session, mfa] = await Promise.all([context.supabase.rpc("staff_session_unlocked"), context.supabase.rpc("staff_mfa_satisfied")]);
    if (session.error || mfa.error || !session.data || !mfa.data) throw new Error("FORBIDDEN");
    const profile = await context.supabase.from("profiles").update({ full_name: data.full_name, phone: data.phone, branch_name: data.branch_name }).eq("id", data.user_id).select("id").single();
    if (profile.error) throw new Error("PROFILE_UPDATE_FAILED");
    if (data.password) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
      if (result.error) throw new Error("PASSWORD_UPDATE_FAILED");
      const audit = await context.supabase.from("activity_log").insert({ user_id: context.userId, action: "إعادة تعيين كلمة مرور موظف", target: data.user_id });
      if (audit.error) throw new Error("AUDIT_FAILED");
    }
    return { id: data.user_id };
  });
