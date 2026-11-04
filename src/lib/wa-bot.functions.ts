import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** المدير يرد على محادثة واتساب من داخل النظام (خلال نافذة الـ٢٤ ساعة فقط). */
export const sendWaChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ phone: z.string().regex(/^\d{8,15}$/), body: z.string().trim().min(1).max(4000), requestId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [a, m] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!a.data && !m.data) throw new Error("الرد على المحادثات للمدير فقط");
    // قراءة آخر رسالة واردة بصلاحيات المستخدم (تمر بقفل الجلسة)
    const { data: last, error } = await context.supabase
      .from("wa_messages")
      .select("created_at, contact_id")
      .eq("phone", data.phone)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { withinServiceWindow } = await import("@/lib/wa-bot/logic");
    if (!withinServiceWindow(last?.created_at, Date.now())) {
      throw new Error("مرّ أكثر من ٢٤ ساعة على آخر رسالة من هذا الرقم؛ واتساب لا يسمح بالرد إلا بعد أن يراسلكم مجددًا.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendOnce } = await import("@/lib/wa-bot/engine.server");
    await sendOnce(supabaseAdmin, { to: data.phone, body: data.body, replyKey: `manual:${data.requestId}`, contactId: last?.contact_id ?? null });
    return { ok: true };
  });

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
