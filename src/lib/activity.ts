import { supabase } from "@/integrations/supabase/client";

/** Records a staff action (sign-in, screen opened, click). Fire-and-forget; never blocks the UI. */
export function logActivity(action: string, target?: string, details?: Record<string, unknown>) {
  void supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user.id;
    if (!uid) return;
    void supabase.from("activity_log").insert({ user_id: uid, action, target: target ?? null, details: (details ?? null) as never }).then(() => undefined);
  });
}
