import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormCard, Notice } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { waLink } from "@/lib/wa-link";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "واتساب — ابو طه للصرافة" }, { name: "description", content: "إرسال رسائل واتساب جاهزة للعملاء والوكلاء." }, { property: "og:title", content: "واتساب — ابو طه للصرافة" }, { property: "og:description", content: "رسائل واتساب جاهزة للعملاء والوكلاء." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WhatsappScreen,
});

const TEMPLATES = [
  { label: "حوالة جاهزة", text: "عزيزنا العميل، حوالتكم جاهزة للاستلام لدى ابو طه للصرافة. للاستفسار: 774379751" },
  { label: "تذكير برصيد", text: "عزيزنا العميل، نرجو مراجعة رصيد حسابكم لدى ابو طه للصرافة. للاستفسار: 774379751" },
  { label: "شكر", text: "شكرًا لتعاملكم مع ابو طه للصرافة والتحويلات المالية." },
];

function WhatsappScreen() {
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState(TEMPLATES[0]?.text ?? "");

  const { data: contacts = [] } = useQuery({
    queryKey: ["wa-contacts"],
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from("customers").select("id, full_name, phone_number").not("phone_number", "is", null).limit(500),
        supabase.from("agents").select("id, agent_name, phone").not("phone", "is", null).limit(500),
      ]);
      return [
        ...(c.data ?? []).map((r) => ({ key: `c${r.id}`, name: r.full_name, phone: r.phone_number ?? "" })),
        ...(a.data ?? []).map((r) => ({ key: `a${r.id}`, name: `${r.agent_name} (وكيل)`, phone: r.phone ?? "" })),
      ];
    },
  });
  const shown = useMemo(() => contacts.filter((c) => !search || c.name.includes(search) || c.phone.includes(search)).slice(0, 30), [contacts, search]);
  const link = waLink(phone, msg);

  return (
    <>
      <SectionIntro title="واتساب" subtitle="اختر الرقم والرسالة، ثم افتحها في واتساب للإرسال." />
      <FormCard onSubmit={(e) => e.preventDefault()}>
        <Field label="رقم الجوال">
          <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XXXXXXXX" />
        </Field>
        <Field label="الرسالة">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => setMsg(t.text)} className="rounded-full border border-border px-2.5 py-1 text-xs">{t.label}</button>
            ))}
          </div>
          <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </Field>
        <Button asChild={!!link} disabled={!link} className="w-full">
          {link ? <a href={link} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> فتح في واتساب</a> : <span>اكتب رقمًا صحيحًا</span>}
        </Button>
      </FormCard>

      <h2 className="mb-2 mt-5 text-sm font-semibold">العملاء والوكلاء</h2>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم" className="mb-2" />
      {shown.length === 0 ? (
        <Notice>لا يوجد عملاء أو وكلاء بأرقام جوال بعد.</Notice>
      ) : (
        <ul className="grid gap-1.5">
          {shown.map((c) => (
            <li key={c.key}>
              <button onClick={() => setPhone(c.phone)} className="flex w-full items-center justify-between rounded-xl bg-card px-3 py-2 text-sm shadow-card">
                <span>{c.name}</span>
                <span dir="ltr" className="ledger-figures text-xs text-muted-foreground">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
