import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** المدير يعتمد أو يرفض طلب واتساب من التطبيق، ثم يُبلَّغ صاحب الطلب على واتساب. */
export const decideWaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), approve: z.boolean(), commission: z.number().min(0).max(1e12).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // التحديث يمر بصلاحيات المستخدم (المدير فقط، والجلسة مفتوحة)
    const { data: row, error } = await context.supabase
      .from("wa_items")
      .update({ status: data.approve ? "approved" : "rejected", commission: data.approve ? data.commission : null, decided_by: context.userId })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الطلب غير موجود أو سبق البت فيه");
    let notified = true;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyDecision } = await import("@/lib/wa-bot/engine.server");
      await notifyDecision(supabaseAdmin, row.id);
    } catch {
      notified = false;
    }
    return { notified };
  });
