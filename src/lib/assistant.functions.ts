import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `أنت "المساعد الآلي" لنظام ابو طه للصرافة والتحويلات المالية.
تجيب الموظفين بالعربية باختصار ووضوح عن طريقة استخدام النظام: الحوالات الصادرة والواردة، سندات القبض والصرف، القيود، بيع وشراء العملات، الصناديق والإقفال، كشوف الحسابات والتقارير، الصلاحيات.
لا تخترع أرصدة أو أسعار صرف أو أرقام حوالات؛ إن سُئلت عنها فوجّه الموظف إلى الشاشة المناسبة.`;

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        messages: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
          .min(1)
          .max(30),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI_UNAVAILABLE");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: data.messages.map((m) => ({ role: m.role, content: m.content })),
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });
    if (res.status === 429) return { error: "الطلبات كثيرة الآن، حاول بعد قليل." };
    if (res.status === 402) return { error: "رصيد المساعد الآلي انتهى." };
    if (!res.ok || !res.body) return { error: "تعذّر الرد الآن." };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let reply = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) reply += ev.delta;
        } catch {}
      }
    }
    return { reply };
  });
