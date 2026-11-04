import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });
        let verified;
        try {
          verified = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 });
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }
        const deliveryId = request.headers.get("X-Lovable-Delivery")?.trim();
        const event = request.headers.get("X-Lovable-Event")?.trim();
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processEvent, processDue } = await import("@/lib/wa-bot/engine.server");

        const { error: insErr } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert({ delivery_id: deliveryId, event, payload: verified.payload as never }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (insErr) return new Response("Store failed", { status: 500 });
        const { data: row, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, event, payload, attempts, processed_at").eq("delivery_id", deliveryId).single();
        if (error || !row) return new Response("Store failed", { status: 500 });

        let ok = true;
        if (!row.processed_at) ok = await processEvent(supabaseAdmin, row);
        // استكمال ما تعثّر سابقًا مع كل رسالة جديدة
        await processDue(supabaseAdmin, 2, row.id).catch(() => {});
        return ok ? new Response("ok") : new Response("Processing failed", { status: 500 });
      },
    },
  },
});
