import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { confirmAsk } from "@/components/confirm-dialog";
import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, FormCard, ListItem, LoadingRows, Notice, Segments, selectCls, StatusPill } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { decideWaItem } from "@/lib/wa-bot.functions";
import { KIND_LABELS, normalizePhone } from "@/lib/wa-bot/logic";

export const Route = createFileRoute("/_authenticated/wa-bot")({
  head: () => ({
    meta: [
      { title: "بوت واتساب — ابو طه للصرافة" },
      { name: "description", content: "ربط أرقام الصرافين والعملاء والمالك ببوت واتساب، ومراجعة الطلبات والإشعارات الواردة." },
      { property: "og:title", content: "بوت واتساب — ابو طه للصرافة" },
      { property: "og:description", content: "طلبات وإشعارات واتساب تُقرأ تلقائيًا وتنتظر الاعتماد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WaBotScreen,
});

type Tab = "items" | "controls" | "contacts" | "messages";
const ROLE_LABELS: Record<string, string> = { exchanger: "صراف / وكيل", customer: "عميل", owner: "المالك" };
const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" }> = {
  pending: { label: "معلق", tone: "warn" },
  approved: { label: "معتمد", tone: "ok" },
  rejected: { label: "مرفوض", tone: "bad" },
  duplicate: { label: "مكرر", tone: "neutral" },
};

function WaBotScreen() {
  const { isManager, isAdmin } = useAppRoles();
  const [tab, setTab] = useState<Tab>("items");
  if (!isManager && !isAdmin) return <Notice tone="warn">هذه الشاشة للمدير فقط.</Notice>;
  return (
    <>
      <MenuStrip tab="/administration" />
      <SectionIntro title="بوت واتساب" subtitle="يقرأ إشعارات الصرافين وطلبات العملاء تلقائيًا، والمالك يعتمدها من واتساب أو من هنا." />
      <Segments<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "items", label: "الطلبات" },
          { value: "controls", label: "التحكم" },
          { value: "contacts", label: "الأرقام" },
          { value: "messages", label: "الرسائل" },
        ]}
      />
      {tab === "items" && <Items />}
      {tab === "controls" && <Controls canEdit={isAdmin} />}
      {tab === "contacts" && <Contacts canEdit={isAdmin} />}
      {tab === "messages" && <Messages />}
    </>
  );
}

function Items() {
  const qc = useQueryClient();
  const decide = useServerFn(decideWaItem);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["wa-items", filter],
    queryFn: async () => {
      let q = supabase.from("wa_items").select("*, wa_contacts(display_name, phone, role)").order("id", { ascending: false }).limit(100);
      if (filter === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    refetchInterval: 20000,
  });
  const m = useMutation({
    mutationFn: async (v: { id: number; approve: boolean }) => {
      let commission: number | null = null;
      if (v.approve) {
        const c = window.prompt("العمولة (اتركها فارغة إن لم توجد):", "");
        if (c === null) throw new Error("أُلغي");
        commission = c.trim() ? Number(c.replace(/,/g, "")) : null;
        if (commission !== null && (!Number.isFinite(commission) || commission < 0)) throw new Error("عمولة غير صحيحة");
      } else if (!(await confirmAsk("رفض هذا الطلب؟"))) throw new Error("أُلغي");
      return decide({ data: { id: v.id, approve: v.approve, commission } });
    },
    onSuccess: (r, v) => {
      toast.success(`${v.approve ? "اعتُمد" : "رُفض"} الطلب${r.notified ? " وأُبلغ صاحبه على واتساب" : "، وتعذّر إبلاغ صاحبه على واتساب"}`);
      void qc.invalidateQueries({ queryKey: ["wa-items"] });
    },
    onError: (e) => e.message !== "أُلغي" && toast.error(e.message),
  });

  return (
    <>
      <Notice className="mb-3">الاعتماد هنا موافقة فقط؛ تسجيل الحوالة أو السند الفعلي يتم من شاشته المعتادة بنفس البيانات.</Notice>
      <Segments<"pending" | "all"> value={filter} onChange={setFilter} options={[{ value: "pending", label: "المعلقة" }, { value: "all", label: "الكل" }]} />
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Bot} title="لا توجد طلبات" hint="تظهر هنا رسائل الصرافين والعملاء بعد قراءتها." />
      ) : (
        <ul className="space-y-2">
          {data.map((i) => {
            const d = i.data as { sender?: string | null; receiver?: string | null; text?: string };
            const s = STATUS[i.status] ?? { label: i.status, tone: "neutral" as const };
            return (
              <ListItem key={i.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      <span className="ledger-figures">#{i.id}</span> {KIND_LABELS[i.kind] ?? i.kind}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.wa_contacts?.display_name || i.wa_contacts?.phone} — {ROLE_LABELS[i.source_role] ?? i.source_role}
                    </div>
                  </div>
                  <StatusPill tone={s.tone}>{s.label}</StatusPill>
                </div>
                {i.summary && <p className="mt-1.5 text-sm">{i.summary}</p>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {i.amount != null && <span className="ledger-figures">{Number(i.amount).toLocaleString("en-US")} {i.currency}</span>}
                  {i.transfer_number && <span>رقم الحوالة: <span className="ledger-figures">{i.transfer_number}</span></span>}
                  {d.sender && <span>المرسل: {d.sender}</span>}
                  {d.receiver && <span>المستلم: {d.receiver}</span>}
                  {i.commission != null && <span>العمولة: <span className="ledger-figures">{i.commission}</span></span>}
                </div>
                {i.duplicate_note && <p className="mt-1 text-xs text-muted-foreground">{i.duplicate_note}</p>}
                {d.text && <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-xs">{d.text}</p>}
                {i.status === "pending" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: i.id, approve: true })}>اعتماد</Button>
                    <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ id: i.id, approve: false })}>رفض</Button>
                  </div>
                )}
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Contacts({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"exchanger" | "customer" | "owner">("customer");
  const [partyId, setPartyId] = useState("");
  const [name, setName] = useState("");

  const contacts = useQuery({
    queryKey: ["wa-contacts-bot"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_contacts").select("*").order("role").order("display_name");
      if (error) throw error;
      return data;
    },
  });
  const parties = useQuery({
    queryKey: ["wa-bot-parties", role],
    enabled: role !== "owner",
    queryFn: async () => {
      if (role === "customer") {
        const { data, error } = await supabase.from("customers").select("id, full_name, phone_number").order("full_name").limit(1000);
        if (error) throw error;
        return data.map((c) => ({ id: c.id, name: c.full_name, phone: c.phone_number ?? "" }));
      }
      const { data, error } = await supabase.from("agents").select("id, agent_name, phone").order("agent_name").limit(1000);
      if (error) throw error;
      return data.map((a) => ({ id: a.id, name: a.agent_name, phone: a.phone ?? "" }));
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const p = normalizePhone(phone);
      if (!/^\d{8,15}$/.test(p)) throw new Error("رقم الجوال غير صحيح");
      const party = parties.data?.find((x) => String(x.id) === partyId);
      if (role !== "owner" && !party) throw new Error(role === "customer" ? "اختر حساب العميل" : "اختر حساب الصراف/الوكيل");
      const { error } = await supabase.from("wa_contacts").insert({
        phone: p,
        role,
        customer_id: role === "customer" ? party!.id : null,
        agent_id: role === "exchanger" ? party!.id : null,
        display_name: name.trim() || party?.name || "المالك",
      });
      if (error) throw new Error(error.code === "23505" ? "هذا الرقم مربوط مسبقًا" : error.message);
    },
    onSuccess: () => {
      toast.success("تم ربط الرقم");
      setPhone(""); setPartyId(""); setName("");
      void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const route = useMutation({
    mutationFn: async (v: { id: number; kinds: string[] }) => {
      const { error } = await supabase.from("wa_contacts").update({ notify_kinds: v.kinds }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] }),
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: number; active: boolean }) => {
      const { error } = await supabase.from("wa_contacts").update({ active: v.active }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] }),
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: number) => {
      if (!(await confirmAsk("فك ربط هذا الرقم؟"))) return;
      const { error } = await supabase.from("wa_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      {canEdit && (
        <FormCard onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Field label="نوع الرقم">
            <select className={selectCls} value={role} onChange={(e) => { setRole(e.target.value as typeof role); setPartyId(""); }}>
              <option value="customer">عميل — يرسل طلباته</option>
              <option value="exchanger">صراف / وكيل — يرسل إشعارات الحوالات</option>
              <option value="owner">المالك — يعتمد ويرسل الأوامر</option>
            </select>
          </Field>
          {role !== "owner" && (
            <Field label={role === "customer" ? "حساب العميل" : "حساب الصراف/الوكيل"}>
              <select
                className={selectCls}
                value={partyId}
                onChange={(e) => {
                  setPartyId(e.target.value);
                  const p = parties.data?.find((x) => String(x.id) === e.target.value);
                  if (p?.phone && !phone) setPhone(p.phone);
                }}
              >
                <option value="">— اختر —</option>
                {(parties.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="رقم واتساب">
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XXXXXXXX" />
          </Field>
          <Field label="اسم يظهر في الرسائل (اختياري)">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={add.isPending}>ربط الرقم</Button>
        </FormCard>
      )}
      <h2 className="mb-2 mt-4 text-sm font-semibold">الأرقام المربوطة</h2>
      <Notice className="mb-2">لكل رقم مالك اختر أنواع الطلبات التي تصله للاعتماد. النوع الذي لا يختاره أي مالك يصل لكل المالكين.</Notice>
      {contacts.isLoading ? (
        <LoadingRows rows={3} />
      ) : !contacts.data?.length ? (
        <EmptyState icon={Bot} title="لا توجد أرقام مربوطة" hint="اربط رقم المالك أولًا، ثم أرقام الصرافين والعملاء." />
      ) : (
        <ul className="space-y-2">
          {contacts.data.map((c) => (
            <ListItem key={c.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{c.display_name || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABELS[c.role]} · <span dir="ltr" className="ledger-figures">+{c.phone}</span>
                </div>
                {c.role === "owner" && (
                  <div className="mt-1.5 flex flex-wrap gap-1" aria-label="أنواع الطلبات الموجهة لهذا الرقم">
                    {ROUTABLE.map((k) => {
                      const on = c.notify_kinds.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={!canEdit || route.isPending}
                          aria-pressed={on}
                          onClick={() => route.mutate({ id: c.id, kinds: on ? c.notify_kinds.filter((x) => x !== k) : [...c.notify_kinds, k] })}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          {KIND_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <StatusPill tone={c.active ? "ok" : "neutral"}>{c.active ? "مفعّل" : "موقوف"}</StatusPill>
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>{c.active ? "إيقاف" : "تفعيل"}</Button>
                    <Button size="icon" variant="ghost" aria-label="فك الربط" onClick={() => del.mutate(c.id)}><Trash2 className="size-4" /></Button>
                  </>
                )}
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </>
  );
}

function Messages() {
  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages"],
    queryFn: async () => {
      const [m, s] = await Promise.all([
        supabase.from("wa_messages").select("id, direction, phone, body, msg_type, send_state, send_error, wa_message_id, created_at, wa_contacts(display_name)").order("id", { ascending: false }).limit(100),
        supabase.from("wa_message_statuses").select("wa_message_id, status").limit(1000),
      ]);
      if (m.error) throw m.error;
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
      const latest = new Map<string, string>();
      for (const r of s.data ?? []) {
        const cur = latest.get(r.wa_message_id);
        if (!cur || (rank[r.status] ?? 0) > (rank[cur] ?? 0)) latest.set(r.wa_message_id, r.status);
      }
      return m.data.map((r) => ({ ...r, delivery: r.wa_message_id ? latest.get(r.wa_message_id) : undefined }));
    },
    refetchInterval: 20000,
  });
  const DELIVERY: Record<string, string> = { accepted: "أُرسلت", sent: "أُرسلت", delivered: "وصلت", read: "قُرئت", failed: "فشلت", sending: "قيد الإرسال", unknown: "غير مؤكد" };
  if (isLoading) return <LoadingRows rows={4} />;
  if (!data?.length) return <EmptyState icon={Bot} title="لا توجد رسائل بعد" hint="تظهر هنا رسائل واتساب الواردة والصادرة." />;
  return (
    <ul className="space-y-1.5">
      {data.map((r) => (
        <ListItem key={r.id} className={r.direction === "out" ? "bg-primary/5" : ""}>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{r.direction === "in" ? "وارد من" : "صادر إلى"} {r.wa_contacts?.display_name || <span dir="ltr" className="ledger-figures">+{r.phone}</span>}</span>
            <span className="ledger-figures">{new Date(r.created_at).toLocaleString("ar-YE-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{r.body || (r.msg_type === "image" ? "📷 صورة" : `(${r.msg_type})`)}</p>
          {r.direction === "out" && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {DELIVERY[r.delivery ?? r.send_state ?? ""] ?? r.send_state}
              {r.send_error && <span className="text-destructive"> — {r.send_error.slice(0, 160)}</span>}
            </div>
          )}
        </ListItem>
      ))}
    </ul>
  );
}

const ROUTABLE = ["transfer_notice", "deposit", "withdrawal", "transfer", "balance_inquiry"] as const;
const CUSTOMER_KINDS = ["deposit", "withdrawal", "transfer", "balance_inquiry"] as const;

type SettingsForm = {
  enabled: boolean;
  exchangers_enabled: boolean;
  customers_enabled: boolean;
  owners_enabled: boolean;
  read_images: boolean;
  reply_unregistered: boolean;
  auto_ack: boolean;
  customer_kinds: string[];
  unregistered_text: string;
  paused_text: string;
};

function Controls({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["wa-bot-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_bot_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  useEffect(() => {
    if (data) setForm({ ...data, customer_kinds: [...data.customer_kinds] });
  }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase.from("wa_bot_settings").update({ ...form, unregistered_text: form.unregistered_text.trim().slice(0, 500), paused_text: form.paused_text.trim().slice(0, 500), updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظت إعدادات البوت");
      void qc.invalidateQueries({ queryKey: ["wa-bot-settings"] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading || !form) return <LoadingRows rows={4} />;
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm({ ...form, [k]: v });
  const row = (k: "enabled" | "exchangers_enabled" | "customers_enabled" | "owners_enabled" | "read_images" | "reply_unregistered" | "auto_ack", label: string, hint: string) => (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={form[k]} disabled={!canEdit || (k !== "enabled" && !form.enabled)} onCheckedChange={(v) => set(k, v)} aria-label={label} />
    </li>
  );
  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); if (canEdit) save.mutate(); }}>
      {!canEdit && <Notice tone="warn">تعديل الإعدادات للمدير العام فقط.</Notice>}
      <ul className="divide-y divide-border">
        {row("enabled", "تشغيل البوت", "إيقافه يرد على الجميع برسالة الإيقاف ولا يعالج شيئًا")}
        {row("exchangers_enabled", "فئة الصرافين والوكلاء", "قراءة إشعارات الحوالات ومنع تكرارها")}
        {row("customers_enabled", "فئة العملاء", "استقبال طلبات الإيداع والسحب والحوالات")}
        {row("owners_enabled", "فئة المالك", "إرسال الطلبات للاعتماد وتنفيذ أوامر المالك")}
        {row("read_images", "قراءة الصور", "تحليل صور الإشعارات والسندات بالذكاء الاصطناعي")}
        {row("auto_ack", "رد الاستلام التلقائي", "إبلاغ المرسل برقم طلبه فور وصوله")}
        {row("reply_unregistered", "الرد على الأرقام غير المسجلة", "إرسال رسالة التسجيل لأي رقم غير مربوط")}
      </ul>
      <Field label="طلبات العملاء المفعّلة">
        <div className="flex flex-wrap gap-1.5 pt-2">
          {CUSTOMER_KINDS.map((k) => {
            const on = form.customer_kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                disabled={!canEdit}
                aria-pressed={on}
                onClick={() => set("customer_kinds", on ? form.customer_kinds.filter((x) => x !== k) : [...form.customer_kinds, k])}
                className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="رسالة الرقم غير المسجل">
        <Textarea rows={2} value={form.unregistered_text} disabled={!canEdit} onChange={(e) => set("unregistered_text", e.target.value)} />
      </Field>
      <Field label="رسالة الإيقاف المؤقت">
        <Textarea rows={2} value={form.paused_text} disabled={!canEdit} onChange={(e) => set("paused_text", e.target.value)} />
      </Field>
      {canEdit && <Button type="submit" className="w-full" disabled={save.isPending}>حفظ الإعدادات</Button>}
    </FormCard>
  );
}
