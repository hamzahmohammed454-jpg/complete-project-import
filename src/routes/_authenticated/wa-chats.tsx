import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, LoadingRows, Notice, StatusPill } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { sendWaChatMessage } from "@/lib/wa-bot.functions";
import { withinServiceWindow } from "@/lib/wa-bot/logic";

export const Route = createFileRoute("/_authenticated/wa-chats")({
  validateSearch: z.object({ phone: z.string().regex(/^\d{8,15}$/).optional() }),
  head: () => ({
    meta: [
      { title: "محادثات واتساب — ابو طه للصرافة" },
      { name: "description", content: "أرقام العملاء والصرافين ومحادثاتهم مع بوت واتساب، والرد عليهم من داخل النظام." },
      { property: "og:title", content: "محادثات واتساب — ابو طه للصرافة" },
      { property: "og:description", content: "محادثات واتساب العملاء من داخل النظام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WaChatsScreen,
});

const ROLE_LABELS: Record<string, string> = { exchanger: "صراف / وكيل", customer: "عميل", owner: "المالك" };
const DELIVERY: Record<string, string> = { accepted: "✓", sent: "✓", delivered: "✓✓", read: "✓✓ قُرئت", failed: "فشلت", sending: "…", unknown: "غير مؤكد" };
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ar-YE-u-nu-latn", { dateStyle: "short", timeStyle: "short" });

function WaChatsScreen() {
  const { isManager, isAdmin } = useAppRoles();
  const { phone } = Route.useSearch();
  if (!isManager && !isAdmin) return <Notice tone="warn">هذه الشاشة للمدير فقط.</Notice>;
  return (
    <>
      <MenuStrip tab="/administration" />
      {phone ? <Thread phone={phone} /> : <Conversations />}
    </>
  );
}

function Conversations() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "chats" | "unregistered">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["wa-chats-list"],
    queryFn: async () => {
      const [m, c] = await Promise.all([
        supabase.from("wa_messages").select("phone, direction, body, msg_type, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("wa_contacts").select("id, phone, role, display_name, active"),
      ]);
      if (m.error) throw m.error;
      if (c.error) throw c.error;
      const byPhone = new Map<string, { phone: string; last: string | null; lastAt: string | null; lastIn: string | null; count: number }>();
      for (const r of m.data) {
        const cur = byPhone.get(r.phone) ?? { phone: r.phone, last: null, lastAt: null, lastIn: null, count: 0 };
        if (!cur.lastAt) { cur.lastAt = r.created_at; cur.last = r.body || (r.msg_type === "image" ? "📷 صورة" : `(${r.msg_type})`); }
        if (r.direction === "in" && !cur.lastIn) cur.lastIn = r.created_at;
        cur.count++;
        byPhone.set(r.phone, cur);
      }
      const contacts = new Map(c.data.map((x) => [x.phone, x]));
      const phones = new Set([...byPhone.keys(), ...contacts.keys()]);
      return [...phones]
        .map((p) => ({ ...(byPhone.get(p) ?? { phone: p, last: null, lastAt: null, lastIn: null, count: 0 }), contact: contacts.get(p) ?? null }))
        .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
    },
    refetchInterval: 15000,
  });

  const rows = useMemo(() => {
    const t = q.trim();
    return (data ?? []).filter((r) => {
      if (filter === "chats" && !r.count) return false;
      if (filter === "unregistered" && r.contact) return false;
      return !t || r.phone.includes(t.replace(/\D/g, "") || "\u0000") || (r.contact?.display_name ?? "").includes(t);
    });
  }, [data, q, filter]);

  return (
    <>
      <SectionIntro title="محادثات واتساب" subtitle="كل الأرقام المربوطة والأرقام التي راسلت البوت، ومحادثة كل رقم." />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" className="mb-2" />
      <div className="mb-3 flex gap-1.5">
        {([["all", "الكل"], ["chats", "فيها رسائل"], ["unregistered", "غير مسجلة"]] as const).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`rounded-full border px-3 py-1 text-xs ${filter === v ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {isLoading ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageCircle} title="لا توجد محادثات" hint="تظهر هنا الأرقام بعد ربطها في شاشة البوت أو عند وصول أول رسالة." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
          {rows.map((r) => {
            const open = withinServiceWindow(r.lastIn, Date.now());
            return (
              <li key={r.phone}>
                <Link to="/wa-chats" search={{ phone: r.phone }} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {(r.contact?.display_name || "#").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{r.contact?.display_name || <span dir="ltr" className="ledger-figures">+{r.phone}</span>}</span>
                      {r.lastAt && <span className="ledger-figures shrink-0 text-[11px] text-muted-foreground">{fmtTime(r.lastAt)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{r.last ?? "لا رسائل بعد"}</span>
                      <span className="flex shrink-0 gap-1">
                        {open && <StatusPill tone="ok">يمكن الرد</StatusPill>}
                        <StatusPill tone={r.contact ? "neutral" : "warn"}>{r.contact ? ROLE_LABELS[r.contact.role] : "غير مسجل"}</StatusPill>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Thread({ phone }: { phone: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendWaChatMessage);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["wa-thread", phone],
    queryFn: async () => {
      const [m, c] = await Promise.all([
        supabase.from("wa_messages").select("id, direction, body, msg_type, send_state, send_error, wa_message_id, created_at").eq("phone", phone).order("created_at", { ascending: false }).limit(200),
        supabase.from("wa_contacts").select("role, display_name, active").eq("phone", phone).maybeSingle(),
      ]);
      if (m.error) throw m.error;
      const ids = m.data.map((r) => r.wa_message_id).filter((x): x is string => !!x);
      const s = ids.length ? await supabase.from("wa_message_statuses").select("wa_message_id, status").in("wa_message_id", ids) : { data: [] };
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
      const latest = new Map<string, string>();
      for (const r of s.data ?? []) {
        const cur = latest.get(r.wa_message_id);
        if (!cur || (rank[r.status] ?? 0) > (rank[cur] ?? 0)) latest.set(r.wa_message_id, r.status);
      }
      const msgs = m.data.reverse().map((r) => ({ ...r, delivery: (r.wa_message_id && latest.get(r.wa_message_id)) || r.send_state }));
      const lastIn = [...msgs].reverse().find((r) => r.direction === "in")?.created_at ?? null;
      return { msgs, contact: c.data, lastIn };
    },
    refetchInterval: 8000,
  });
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [data?.msgs.length]);

  const m = useMutation({
    mutationFn: () => send({ data: { phone, body: text.trim(), requestId: crypto.randomUUID() } }),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["wa-thread", phone] });
    },
    onError: (e) => toast.error(e.message),
  });
  const open = withinServiceWindow(data?.lastIn, Date.now());

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع للمحادثات">
          <Link to="/wa-chats" search={{}}><ArrowRight className="size-5" /></Link>
        </Button>
        <div className="min-w-0">
          <div className="truncate font-semibold">{data?.contact?.display_name || "رقم غير مسجل"}</div>
          <div className="text-xs text-muted-foreground">
            <span dir="ltr" className="ledger-figures">+{phone}</span>
            {data?.contact && ` · ${ROLE_LABELS[data.contact.role]}${data.contact.active ? "" : " (موقوف)"}`}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 rounded-2xl bg-muted/50 p-3">
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : !data?.msgs.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد رسائل مع هذا الرقم بعد.</p>
        ) : (
          data.msgs.map((r) => (
            <div key={r.id} className={`flex ${r.direction === "out" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-card ${r.direction === "out" ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm bg-card"}`}>
                <p className="whitespace-pre-line">{r.body || (r.msg_type === "image" ? "📷 صورة" : `(${r.msg_type})`)}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span className="ledger-figures">{fmtTime(r.created_at)}</span>
                  {r.direction === "out" && <span className={r.delivery === "failed" ? "text-destructive" : ""}>{DELIVERY[r.delivery ?? ""] ?? r.delivery}</span>}
                </div>
                {r.send_error && <p className="mt-0.5 text-[10.5px] text-destructive">{r.send_error.slice(0, 140)}</p>}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 mt-3 flex items-end gap-2 bg-background py-2"
        onSubmit={(e) => { e.preventDefault(); if (text.trim() && open) m.mutate(); }}
      >
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!open || m.isPending}
          placeholder={open ? "اكتب ردك…" : "لا يمكن الرد: مرّ أكثر من ٢٤ ساعة على آخر رسالة من هذا الرقم"}
          className="min-h-11 flex-1 resize-none"
        />
        <Button type="submit" size="icon" className="size-11" disabled={!open || !text.trim() || m.isPending} aria-label="إرسال">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
