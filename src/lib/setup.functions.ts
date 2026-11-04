import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { usernameToEmail } from "@/lib/username";

/** The very first administrator: username and display name used only while no admin exists. */
export const FIRST_ADMIN_USERNAME = "admin";
export const FIRST_ADMIN_NAME = "مدير النظام";

async function adminExists() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [roles, claim] = await Promise.all([
    supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin"),
    supabaseAdmin.from("admin_setup_claim").select("id").eq("id", 1).maybeSingle(),
  ]);
  if (roles.error || claim.error) throw new Error("FAILED");
  return (roles.count ?? 0) > 0 || Boolean(claim.data);
}

/** Imported admin accounts (moved from the previous backend) that still have no password. */
async function pendingImportedAdmin(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("imported_password_setup").select("user_id").limit(1).maybeSingle();
  if (error) throw new Error("FAILED");
  if (!data) return null;
  const role = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.user_id).eq("role", "admin").maybeSingle();
  if (role.error) throw new Error("FAILED");
  return role.data ? data.user_id : null;
}

/** Public: tells the sign-in screen whether the one-time admin password setup is still open. */
export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  if (await pendingImportedAdmin()) return { needsSetup: true };
  return { needsSetup: !(await adminExists()) };
});

/** Public but one-time: creates the first admin only while the system has no admin at all,
 *  or sets the first password of the imported admin account (claimed atomically, once). */
export const setupFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data }) => {
    const importedId = await pendingImportedAdmin();
    if (importedId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Atomic claim: only the request that deletes the row may set the password.
      const claimed = await supabaseAdmin.from("imported_password_setup").delete().eq("user_id", importedId).select("user_id");
      if (claimed.error || !claimed.data?.length) throw new Error("ALREADY_SET_UP");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(importedId, { password: data.password, email_confirm: true });
      if (error) {
        await supabaseAdmin.from("imported_password_setup").insert({ user_id: importedId });
        throw new Error(/weak|easy to guess|pwned|leaked/i.test(error.message ?? "") ? "WEAK_PASSWORD" : "FAILED");
      }
      return { username: FIRST_ADMIN_USERNAME };
    }
    if (await adminExists()) throw new Error("ALREADY_SET_UP");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claim = await supabaseAdmin.from("admin_setup_claim").insert({ id: 1 });
    if (claim.error) throw new Error("ALREADY_SET_UP");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(FIRST_ADMIN_USERNAME),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: FIRST_ADMIN_NAME, username: FIRST_ADMIN_USERNAME },
    });
    if (error || !created.user) {
      await supabaseAdmin.from("admin_setup_claim").delete().eq("id", 1);
      throw new Error(/weak|easy to guess/i.test(error?.message ?? "") ? "WEAK_PASSWORD" : "FAILED");
    }
    const id = created.user.id;
    const profile = await supabaseAdmin.from("profiles").update({ username: FIRST_ADMIN_USERNAME, full_name: FIRST_ADMIN_NAME }).eq("id", id).select("id").single();
    const role = await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "admin" });
    if (role.error || profile.error) {
      const cleanup = await supabaseAdmin.auth.admin.deleteUser(id);
      if (!cleanup.error) await supabaseAdmin.from("admin_setup_claim").delete().eq("id", 1);
      throw new Error("FAILED");
    }
    return { username: FIRST_ADMIN_USERNAME };
  });
