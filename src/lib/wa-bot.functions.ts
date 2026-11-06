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

/** المدير فقط، والجلسة مفتوحة والتحقق بخطوتين مستوفى. */
async function requireBotManager(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const [a, m, s, f] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    context.supabase.rpc("staff_session_unlocked"),
    context.supabase.rpc("staff_mfa_satisfied"),
  ]);
  if ((!a.data && !m.data) || !s.data || !f.data) throw new Error("هذه العملية للمدير فقط وبجلسة مفتوحة");
}

/** يحلل إشعارًا يلصقه المدير (نص و/أو صورة) ويضيفه لعمليات المراجعة دون ترحيل أي مبلغ. */
export const analyzeWaNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().trim().max(4000),
        image: z.string().max(7_500_000).regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/).nullable(),
        requestId: z.string().uuid(),
      })
      .refine((v) => v.text.length > 0 || v.image, "الصق نص الإشعار أو اختر صورته")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireBotManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inboundId = `paste:${data.requestId}`;
    const { data: existing, error: exErr } = await supabaseAdmin.from("wa_items").select("id, kind, status").eq("inbound_message_id", inboundId).maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing) return existing;
    const { analyze, findDuplicate } = await import("@/lib/wa-bot/engine.server");
    let a;
    try {
      a = await analyze(data.text, data.image);
    } catch (e) {
      throw new Error(`تعذّر تحليل الإشعار: ${e instanceof Error ? e.message : String(e)}`);
    }
    const dup = a.transfer_number ? await findDuplicate(supabaseAdmin, a.transfer_number, inboundId) : null;
    const { data: row, error } = await supabaseAdmin
      .from("wa_items")
      .insert({
        inbound_message_id: inboundId,
        contact_id: null,
        source_role: "manual",
        kind: a.kind,
        summary: a.summary,
        data: { sender: a.sender, receiver: a.receiver, text: data.text.slice(0, 1000), pasted_by: context.userId },
        transfer_number: a.transfer_number,
        amount: a.amount,
        currency: a.currency,
        status: dup ? "duplicate" : a.kind === "other" ? "rejected" : "pending",
        duplicate_note: dup ?? (a.kind === "other" ? "ليست عملية مالية" : null),
      })
      .select("id, kind, status")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** يعرض صورة رسالة واتساب واردة للمدير؛ تُنزَّل عند الطلب ولا تُخزَّن روابطها. */
export const getWaMessageImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireBotManager(context);
    const { data: msg, error } = await context.supabase.from("wa_messages").select("media_id").eq("id", data.id).eq("direction", "in").maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg?.media_id) throw new Error("لا توجد صورة في هذه الرسالة");
    const { downloadMedia } = await import("@/lib/wa-bot/engine.server");
    const file = await downloadMedia(msg.media_id);
    if (!file) throw new Error("الصورة أكبر من الحد المسموح");
    if (!file.mime.startsWith("image/")) throw new Error("الملف ليس صورة");
    return { dataUrl: file.dataUrl };
  });
