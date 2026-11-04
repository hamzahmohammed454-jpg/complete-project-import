import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { useState } from "react";

import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant } from "@/lib/assistant.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "المساعد الآلي — ابو طه للصرافة" }, { name: "description", content: "اسأل المساعد الآلي عن طريقة استخدام النظام." }, { property: "og:title", content: "المساعد الآلي — ابو طه للصرافة" }, { property: "og:description", content: "مساعد ذكي يشرح شاشات النظام للموظفين." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AssistantScreen,
});

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = ["كيف أرسل حوالة؟", "كيف أقفل الصندوق آخر اليوم؟", "كيف أطبع كشف حساب عميل؟"];

function AssistantScreen() {
  const ask = useServerFn(askAssistant);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await ask({ data: { messages: next.slice(-20) } });
      setMsgs([...next, { role: "assistant", content: "reply" in r && r.reply ? r.reply : (r as { error?: string }).error ?? "تعذّر الرد." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "تعذّر الاتصال بالمساعد، تأكد من الإنترنت." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionIntro title="المساعد الآلي" subtitle="اسأل عن أي شاشة أو عملية في النظام." />
      <div className="mb-3 grid gap-2">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-card">
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ms-auto bg-primary text-primary-foreground" : "me-auto bg-card shadow-card"}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="me-auto rounded-2xl bg-card px-3 py-2 text-sm text-muted-foreground shadow-card">يكتب…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-end gap-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب سؤالك…" rows={2} className="flex-1" />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="إرسال"><Send className="size-4" /></Button>
      </form>
    </>
  );
}
