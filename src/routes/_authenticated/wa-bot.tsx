import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FileSearch, ImageIcon, Pencil, Search, Sparkles, Trash2, RefreshCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { analyzeWaNotice, decideWaItem, getWaMessageImage } from "@/lib/wa-bot.functions";
import { botGate, canOpenForPosting, inboxMatch, KIND_LABELS, normalizePhone, routeToOwners, suggestedDirection } from "@/lib/wa-bot/logic";

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

type Tab = "items" | "review" | "inbox" | "contacts" | "controls";
const ROLE_LABELS: Record<string, string> = { exchanger: "صراف / وكيل", customer: "عميل", owner: "المالك", manual: "لصق يدوي" };
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
      <SectionIntro title="بوت واتساب" subtitle="وسيط بين النظام ورسائل الصرافين والعملاء: يقرأ، يطابق، ويجهّز العملية لتحفظها بنفسك" />
      <div className="mb-3 overflow-x-auto">
        <Segments<Tab>
          className="min-w-[30rem]"
          value={tab}
          onChange={setTab}
          options={[
            { value: "items", label: "الطلبات" },
            { value: "review", label: "عمليات للمراجعة" },
            { value: "inbox", label: "الوارد" },
            { value: "contacts", label: "القنوات" },
            { value: "controls", label: "الإعدادات" },
          ]}
        />
      </div>
      {tab === "items" && <Items />}
      {tab === "review" && <Review />}
      {tab === "inbox" && <Inbox />}
      {tab === "contacts" && <Contacts canEdit={isAdmin} />}
      {tab === "controls" && <Controls canEdit={isAdmin} />}
    </>
  );
}

function Items() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
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
      <Notice className="mb-3">الاعتماد هنا موافقة فقط. «فتح للحفظ» يفتح شاشة الحوالة معبّأة، وتراجعها وتحفظها بنفسك.</Notice>
      <Segments<"pending" | "all"> value={filter} onChange={setFilter} options={[{ value: "pending", label: "المعلقة" }, { value: "all", label: "الكل" }]} />
      <div className="mb-3 space-y-2">
        <div className="flex gap-2"><Input aria-label="البحث في طلبات البوت" placeholder="رقم الطلب أو الحوالة أو اسم العميل" value={search} onChange={(e) => setSearch(e.target.value)} /><Button size="icon" variant="outline" aria-label="تحديث الطلبات" title="تحديث الطلبات" onClick={() => void qc.invalidateQueries({ queryKey: ["wa-items"] })}><RefreshCw className="size-4" /></Button></div>
        <div className="grid grid-cols-2 gap-2"><select className={selectCls} aria-label="نوع الطلب" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="all">كل أنواع الطلبات</option>{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select className={selectCls} aria-label="حالة الطلب" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); if (e.target.value !== "pending") setFilter("all"); }}><option value="all">كل الحالات</option>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
      </div>
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={Bot} title="لا توجد طلبات" hint="تظهر هنا رسائل الصرافين والعملاء بعد قراءتها." />
      ) : (
        <ul className="space-y-2">
          {data.filter((i) => (kindFilter === "all" || i.kind === kindFilter) && (statusFilter === "all" || i.status === statusFilter) && (!search.trim() || [i.id, i.transfer_number, i.summary, i.wa_contacts?.display_name, i.wa_contacts?.phone].some((v) => String(v ?? "").includes(search.trim())))).map((i) => {
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
                <PostingActions item={i} />
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const reset = () => { setEditingId(null); setPhone(""); setPartyId(""); setName(""); };

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
      const values = {
        phone: p,
        role,
        customer_id: role === "customer" ? party?.id ?? null : null,
        agent_id: role === "exchanger" ? party?.id ?? null : null,
        display_name: name.trim() || party?.name || "المالك",
      };
      const q = editingId === null
        ? supabase.from("wa_contacts").insert(values)
        : supabase.from("wa_contacts").update(values).eq("id", editingId);
      const { error } = await q.select("id").single();
      if (error) throw new Error(error.code === "23505" ? "هذا الرقم مربوط مسبقًا" : error.message);
    },
    onSuccess: () => {
      toast.success(editingId === null ? "تم ربط الرقم" : "حُفظ تعديل الرقم");
      reset();
      void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const route = useMutation({
    mutationFn: async (v: { id: number; kinds: string[] }) => {
      if (!(await confirmAsk("حفظ توجيه الطلبات لهذا الرقم؟"))) return;
      const { error } = await supabase.from("wa_contacts").update({ notify_kinds: v.kinds }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa-contacts-bot"] }),
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: number; active: boolean }) => {
      if (!(await confirmAsk(v.active ? "تفعيل هذا الرقم؟" : "إيقاف التعامل مع هذا الرقم؟"))) return;
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
          <h2 className="text-sm font-semibold">{editingId === null ? "ربط رقم جديد" : "تعديل الرقم"}</h2>
          <Field label="نوع الرقم">
            <select className={selectCls} value={role} disabled={editingId !== null} onChange={(e) => { setRole(e.target.value as typeof role); setPartyId(""); }}>
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
                  if (p?.phone) setPhone(p.phone);
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
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={add.isPending}>{editingId === null ? "ربط الرقم" : "حفظ التعديل"}</Button>
            {editingId !== null && <Button variant="outline" type="button" disabled={add.isPending} onClick={reset}>إلغاء</Button>}
          </div>
        </FormCard>
      )}
      <h2 className="mb-2 mt-4 text-sm font-semibold">الأرقام المربوطة</h2>
      <div className="mb-3 flex flex-col gap-2">
        <div className="relative"><Search className="absolute end-3 top-3 size-4 text-muted-foreground" /><Input aria-label="البحث في الأرقام" className="pe-10" placeholder="الاسم أو رقم واتساب" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="تصفية نوع الرقم" className={selectCls} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">كل الفئات</option>{Object.entries(ROLE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
          <select aria-label="تصفية حالة الرقم" className={selectCls} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="all">كل الحالات</option><option value="active">مفعّل</option><option value="paused">موقوف</option></select>
        </div>
      </div>
      {contacts.isError && <Notice tone="warn">تعذّر تحميل الأرقام: {contacts.error.message}</Notice>}
      {contacts.isLoading ? (
        <LoadingRows rows={3} />
      ) : !contacts.data?.length ? (
        <EmptyState icon={Bot} title="لا توجد أرقام مربوطة" hint="اربط رقم المالك أولًا، ثم أرقام الصرافين والعملاء." />
      ) : (
        <ul className="space-y-2">
          {contacts.data.filter((c) => (roleFilter === "all" || c.role === roleFilter) && (stateFilter === "all" || c.active === (stateFilter === "active")) && (!search.trim() || (c.display_name ?? "").includes(search.trim()) || c.phone.includes(normalizePhone(search)) && /[0-9٠-٩]/.test(search))).map((c) => (
            <ListItem key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                        <Button size="sm" variant={on ? "default" : "outline"}
                          key={k}
                          type="button"
                          disabled={!canEdit || route.isPending}
                          aria-pressed={on}
                          onClick={() => route.mutate({ id: c.id, kinds: on ? c.notify_kinds.filter((x) => x !== k) : [...c.notify_kinds, k] })}
                          className="h-auto min-h-8 whitespace-normal px-2 py-1 text-xs"
                        >
                          {KIND_LABELS[k]}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone={c.active ? "ok" : "neutral"}>{c.active ? "مفعّل" : "موقوف"}</StatusPill>
                {canEdit && (
                  <>
                    <Switch aria-label={`تفعيل ${c.display_name || c.phone}`} checked={c.active} disabled={toggle.isPending} onCheckedChange={(active) => toggle.mutate({ id: c.id, active })} />
                    <Button size="icon" variant="ghost" aria-label={`تعديل ${c.display_name || c.phone}`} title="تعديل الرقم" onClick={() => { setEditingId(c.id); setRole(c.role as typeof role); setPartyId(String(c.customer_id ?? c.agent_id ?? "")); setName(c.display_name ?? ""); setPhone(c.phone); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="فك الربط" title="فك الربط" disabled={del.isPending} onClick={() => del.mutate(c.id)}><Trash2 className="size-4" /></Button>
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

type PostableItem = { id: number; kind: string; status: string; posted_id: number | null; posted_table: string | null };

/** «فتح للحفظ»: يفتح شاشة قبض/توريد الحوالة معبّأة من الطلب؛ الحفظ الفعلي من الشاشة المعتادة. */
function PostingActions({ item }: { item: PostableItem }) {
  if (item.posted_id != null) {
    const dir = item.posted_table === "outgoing_transfers" ? "outgoing" : "incoming";
    return <div className="mt-2 flex items-center gap-2 text-xs"><StatusPill tone="ok">محفوظة كحوالة {dir === "outgoing" ? "صادرة" : "واردة"}</StatusPill><Link className="text-primary underline" to="/transfers" search={{ dir }}>عرض الحوالات</Link></div>;
  }
  if (!canOpenForPosting(item)) return null;
  const suggested = suggestedDirection(item.kind);
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {(["incoming", "outgoing"] as const).map((dir) => (
        <Button key={dir} size="sm" variant={suggested === dir ? "default" : "outline"} asChild>
          <Link to="/transfers" search={{ dir, wa: item.id }}><FileSearch className="size-4" />فتح للحفظ {dir === "incoming" ? "كواردة" : "كصادرة"}</Link>
        </Button>
      ))}
    </div>
  );
}

/** عمليات للمراجعة: لصق إشعار وتحليله، وقائمة الحوالات المقروءة التي لم تُحفظ بعد. */
function Review() {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeWaNotice);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState("all");
  const [source, setSource] = useState("all");
  const [showPosted, setShowPosted] = useState(false);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["wa-items", "review", showPosted],
    queryFn: async () => {
      let q = supabase.from("wa_items").select("*, wa_contacts(display_name, phone, role)").in("kind", ["transfer_notice", "transfer"]).order("id", { ascending: false }).limit(200);
      q = showPosted ? q.not("posted_id", "is", null) : q.is("posted_id", null).in("status", ["pending", "approved"]);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    refetchInterval: 20000,
  });
  const run = useMutation({
    mutationFn: async () => {
      if (!text.trim() && !image) throw new Error("الصق نص الإشعار أو اختر صورته");
      return analyzeFn({ data: { text: text.trim(), image, requestId } });
    },
    onSuccess: (r) => {
      toast.success(r.status === "duplicate" ? "الحوالة مسجلة مسبقًا؛ لم تُفتح عملية مكررة." : r.status === "rejected" ? "ليست عملية مالية." : `حُلّل الإشعار وأُضيف للمراجعة برقم #${r.id}`);
      setText(""); setImage(null); setRequestId(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["wa-items"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error("اختر صورة PNG أو JPG"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الصورة أكبر من 5 ميجابايت"); return; }
    const r = new FileReader();
    r.onload = () => setImage(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(file);
  };
  const rows = data.filter((i) => (kind === "all" || i.kind === kind) && (source === "all" || i.source_role === source));
  return (
    <>
      <FormCard confirm={false} onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
        <Field label="الصق إشعارًا واحدًا للتحليل"><Textarea rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="نص إشعار الحوالة كما وصل من الصراف أو العميل" /></Field>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"><ImageIcon className="size-4" />{image ? "تغيير الصورة" : "صورة الإشعار (اختياري)"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} /></label>
          {image && <Button type="button" size="sm" variant="ghost" onClick={() => setImage(null)}>إزالة الصورة</Button>}
          <Button type="submit" className="ms-auto" disabled={run.isPending}><Sparkles className="size-4" />{run.isPending ? "جارٍ التحليل…" : "تحليل"}</Button>
        </div>
        {image && <img src={image} alt="صورة الإشعار المختارة" className="max-h-48 rounded-lg border border-border object-contain" />}
      </FormCard>
      <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{showPosted ? "سجل الحفظ" : "عمليات للمراجعة"} <span className="ledger-figures text-muted-foreground">({rows.length})</span></h2>
        <Button size="sm" variant="outline" onClick={() => setShowPosted((v) => !v)}>{showPosted ? "عمليات للمراجعة" : "سجل الحفظ"}</Button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <select aria-label="نوع العملية" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">كل الأنواع</option><option value="transfer_notice">{KIND_LABELS["transfer_notice"]}</option><option value="transfer">{KIND_LABELS["transfer"]}</option></select>
        <select aria-label="مصدر العملية" className={selectCls} value={source} onChange={(e) => setSource(e.target.value)}><option value="all">كل المصادر</option>{Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      </div>
      {error ? <Notice tone="warn">تعذّر تحميل العمليات: {error.message}</Notice> : isLoading ? <LoadingRows rows={3} /> : rows.length === 0 ? (
        <EmptyState icon={FileSearch} title={showPosted ? "لا توجد عمليات محفوظة بعد" : "لا توجد عمليات للمراجعة"} hint="تظهر هنا الحوالات التي قرأها البوت من الإشعارات قبل حفظها." />
      ) : (
        <ul className="space-y-2">
          {rows.map((i) => {
            const d = i.data as { sender?: string | null; receiver?: string | null };
            const s = STATUS[i.status] ?? { label: i.status, tone: "neutral" as const };
            return (
              <ListItem key={i.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold"><span className="ledger-figures">#{i.id}</span> {KIND_LABELS[i.kind] ?? i.kind}{i.amount != null && <> · <span className="ledger-figures">{Number(i.amount).toLocaleString("en-US")}</span> {i.currency ?? "عملة غير محددة"}</>}</div>
                    <div className="text-xs text-muted-foreground">{i.wa_contacts?.display_name || ROLE_LABELS[i.source_role] || i.source_role} · <span className="ledger-figures">{new Date(i.created_at).toLocaleString("ar-YE-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}</span></div>
                  </div>
                  <StatusPill tone={s.tone}>{s.label}</StatusPill>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {d.sender && <span>المرسل: {d.sender}</span>}
                  {d.receiver && <span>المستلم: {d.receiver}</span>}
                  {i.transfer_number && <span>رقم الحوالة: <span className="ledger-figures">{i.transfer_number}</span></span>}
                </div>
                {(!i.amount || !i.currency) && !showPosted && <p className="mt-1 text-xs text-warning">ناقص: {[!i.amount && "المبلغ", !i.currency && "العملة"].filter(Boolean).join(" و")} — أكمله في شاشة الحفظ.</p>}
                <PostingActions item={i} />
              </ListItem>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** الوارد: سجل رسائل واتساب الواردة مع حالة المطابقة وفتح الإشعار وصورته. */
function Inbox() {
  const [search, setSearch] = useState("");
  const [match, setMatch] = useState<"all" | "matched" | "review">("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["wa-inbox"],
    queryFn: async () => {
      const { data: msgs, error } = await supabase.from("wa_messages").select("id, phone, body, msg_type, media_id, wa_message_id, created_at, wa_contacts(display_name, role)").eq("direction", "in").order("id", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = msgs.map((m) => m.wa_message_id).filter((v): v is string => !!v);
      const items = ids.length ? await supabase.from("wa_items").select("id, inbound_message_id, kind, status, summary, amount, currency, transfer_number, posted_id, posted_table").in("inbound_message_id", ids) : { data: [], error: null };
      if (items.error) throw items.error;
      const byMsg = new Map((items.data ?? []).map((i) => [i.inbound_message_id, i]));
      return msgs.map((m) => ({ ...m, item: m.wa_message_id ? byMsg.get(m.wa_message_id) : undefined }));
    },
    refetchInterval: 20000,
  });
  const q = search.trim();
  const rows = (data ?? []).filter((m) => (match === "all" || inboxMatch(m.item) === match) && (!q || [m.body, m.phone, m.wa_contacts?.display_name].some((v) => String(v ?? "").includes(q))));
  const open = (data ?? []).find((m) => m.id === openId) ?? null;
  return (
    <>
      <div className="mb-3 space-y-2">
        <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute end-3 top-3 size-4 text-muted-foreground" /><Input aria-label="البحث في الوارد" className="pe-10" placeholder="بحث في النص أو المرسل أو القناة" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Button size="icon" variant="outline" aria-label="تحديث الوارد" title="تحديث الوارد" onClick={() => void refetch()}><RefreshCw className="size-4" /></Button></div>
        <Segments<"all" | "matched" | "review"> value={match} onChange={setMatch} options={[{ value: "all", label: "الكل" }, { value: "matched", label: "تمت المطابقة" }, { value: "review", label: "تحتاج مراجعة" }]} />
      </div>
      {error ? <Notice tone="warn">تعذّر تحميل الوارد: {error.message}</Notice> : isLoading ? <LoadingRows rows={4} /> : rows.length === 0 ? (
        <EmptyState icon={Bot} title="لا توجد رسائل واردة" hint="تظهر هنا كل رسالة تصل للبوت من الصرافين والعملاء والمالك." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((m) => (
            <ListItem key={m.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{m.wa_contacts?.display_name || <span dir="ltr" className="ledger-figures">+{m.phone}</span>}</div>
                  <div className="text-xs text-muted-foreground">{m.wa_contacts ? ROLE_LABELS[m.wa_contacts.role] ?? m.wa_contacts.role : "رقم غير مسجل"}{m.item ? ` · ${KIND_LABELS[m.item.kind] ?? m.item.kind}` : ""}</div>
                </div>
                <StatusPill tone={m.item ? "ok" : "warn"}>{m.item ? "تمت المطابقة" : "تحتاج مراجعة"}</StatusPill>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm">{m.body || (m.media_id ? "[صورة]" : `(${m.msg_type})`)}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="ledger-figures">{new Date(m.created_at).toLocaleString("ar-YE-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}</span>
                <Button size="sm" variant="ghost" onClick={() => setOpenId(m.id)}><FileSearch className="size-4" />فتح الإشعار</Button>
              </div>
            </ListItem>
          ))}
        </ul>
      )}
      <Dialog open={open != null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {open && <InboxDetail msg={open} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InboxDetail({ msg }: { msg: { id: number; phone: string; body: string | null; media_id: string | null; created_at: string; wa_contacts: { display_name: string; role: string } | null; item?: (PostableItem & { summary: string; amount: number | null; currency: string | null; transfer_number: string | null }) | undefined } }) {
  const imageFn = useServerFn(getWaMessageImage);
  const img = useMutation({ mutationFn: () => imageFn({ data: { id: msg.id } }), onError: (e) => toast.error(e.message) });
  const s = msg.item ? STATUS[msg.item.status] : undefined;
  return (
    <>
      <DialogHeader><DialogTitle>{msg.wa_contacts?.display_name || `+${msg.phone}`}</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground"><span dir="ltr" className="ledger-figures">+{msg.phone}</span> · <span className="ledger-figures">{new Date(msg.created_at).toLocaleString("ar-YE-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}</span></div>
        {msg.body && <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2">{msg.body}</p>}
        {msg.item ? (
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-semibold"><span className="ledger-figures">#{msg.item.id}</span> {KIND_LABELS[msg.item.kind] ?? msg.item.kind}</span>{s && <StatusPill tone={s.tone}>{s.label}</StatusPill>}</div>
            {msg.item.summary && <p className="mt-1 text-xs">{msg.item.summary}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{msg.item.amount != null && <span className="ledger-figures">{Number(msg.item.amount).toLocaleString("en-US")} {msg.item.currency}</span>}{msg.item.transfer_number && <span>رقم الحوالة: <span className="ledger-figures">{msg.item.transfer_number}</span></span>}</div>
            <PostingActions item={msg.item} />
          </div>
        ) : <Notice tone="warn">لم يقرأ البوت هذه الرسالة كطلب. إن كانت إشعار حوالة، الصقها في «عمليات للمراجعة».</Notice>}
        {msg.media_id && (img.data ? <img src={img.data.dataUrl} alt="صورة الإشعار" className="w-full rounded-lg border border-border object-contain" /> : <Button variant="outline" className="w-full" disabled={img.isPending} onClick={() => img.mutate()}><ImageIcon className="size-4" />{img.isPending ? "جارٍ تحميل الصورة…" : "عرض صورة الإشعار"}</Button>)}
      </div>
    </>
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["wa-bot-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_bot_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const contacts = useQuery({ queryKey: ["wa-contacts-bot"], queryFn: async () => {
    const { data, error } = await supabase.from("wa_contacts").select("*").order("display_name");
    if (error) throw error;
    return data;
  } });
  const [form, setForm] = useState<SettingsForm | null>(null);
  useEffect(() => {
    if (data) setForm({ enabled: data.enabled, exchangers_enabled: data.exchangers_enabled, customers_enabled: data.customers_enabled, owners_enabled: data.owners_enabled, read_images: data.read_images, reply_unregistered: data.reply_unregistered, auto_ack: data.auto_ack, customer_kinds: [...data.customer_kinds], unregistered_text: data.unregistered_text, paused_text: data.paused_text });
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
  if (isLoading) return <LoadingRows rows={4} />;
  if (error) return <Notice tone="warn">تعذّر تحميل الإعدادات: {error.message}</Notice>;
  if (!form) return <Notice tone="warn">إعدادات البوت غير موجودة.</Notice>;
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
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">حالة البوت</h2><StatusPill tone={data?.enabled ? "ok" : "neutral"}>{data?.enabled ? "مفعّل" : "موقوف"}</StatusPill></div>
      <div className="grid grid-cols-3 gap-2 border-b border-border pb-3">
        {(["exchanger", "customer", "owner"] as const).map((role) => <div key={role} className="min-w-0 text-center"><div className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</div><div className="ledger-figures text-lg font-semibold">{contacts.data?.filter((c) => c.role === role && c.active).length ?? "—"}</div><StatusPill tone={data && botGate(data, role) === "ok" ? "ok" : "neutral"}>{data && botGate(data, role) === "ok" ? "مفعّل" : "موقوف"}</StatusPill></div>)}
      </div>
      <ul className="space-y-2" aria-label="فئات تشغيل البوت">
        {([{ role: "exchanger", key: "exchangers_enabled", title: "بوت الصرافين والوكلاء" }, { role: "customer", key: "customers_enabled", title: "بوت العملاء" }, { role: "owner", key: "owners_enabled", title: "بوت المالك" }] as const).map((category) => <li key={category.role} className="border-b border-border py-3">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{category.title}</h3><Switch aria-label={category.title} checked={form[category.key]} disabled={!canEdit || !form.enabled} onCheckedChange={(value) => set(category.key, value)} /></div>
          <div className="mt-2 text-xs text-muted-foreground">الأرقام المفعّلة: <span className="ledger-figures">{contacts.data?.filter((contact) => contact.role === category.role && contact.active).length ?? "—"}</span></div>
          <p className="mt-1 break-words text-xs">{contacts.data?.filter((contact) => contact.role === category.role && contact.active).map((contact) => contact.display_name || `+${contact.phone}`).join("، ") || "لا توجد أرقام مفعّلة"}</p>
        </li>)}
      </ul>
      {!canEdit && <Notice tone="warn">تعديل الإعدادات للمدير العام فقط.</Notice>}
      <ul className="divide-y divide-border">
        {row("enabled", "تشغيل البوت", "إيقافه يرد على الجميع برسالة الإيقاف ولا يعالج شيئًا")}
        {row("read_images", "قراءة الصور", "تحليل صور الإشعارات والسندات بالذكاء الاصطناعي")}
        {row("auto_ack", "رد الاستلام التلقائي", "إبلاغ المرسل برقم طلبه فور وصوله")}
        {row("reply_unregistered", "الرد على الأرقام غير المسجلة", "إرسال رسالة التسجيل لأي رقم غير مربوط")}
      </ul>
      <Field label="طلبات العملاء المفعّلة">
        <div className="flex flex-wrap gap-1.5 pt-2">
          {CUSTOMER_KINDS.map((k) => {
            const on = form.customer_kinds.includes(k);
            return (
              <Button size="sm" variant={on ? "default" : "outline"}
                key={k}
                type="button"
                disabled={!canEdit}
                aria-pressed={on}
                onClick={() => set("customer_kinds", on ? form.customer_kinds.filter((x) => x !== k) : [...form.customer_kinds, k])}
                className="h-auto min-h-9 whitespace-normal text-xs"
              >
                {KIND_LABELS[k]}
              </Button>
            );
          })}
        </div>
      </Field>
      <Field label="رسالة الرقم غير المسجل">
        <Textarea rows={2} maxLength={500} value={form.unregistered_text} disabled={!canEdit} onChange={(e) => set("unregistered_text", e.target.value)} />
      </Field>
      <Field label="رسالة الإيقاف المؤقت">
        <Textarea rows={2} maxLength={500} value={form.paused_text} disabled={!canEdit} onChange={(e) => set("paused_text", e.target.value)} />
      </Field>
      <h3 className="text-sm font-semibold">وجهات الطلبات</h3>
      {contacts.isError ? <Notice tone="warn">تعذّر تحميل وجهات الطلبات.</Notice> : <ul className="divide-y divide-border">{ROUTABLE.map((kind) => {
        const owners = (contacts.data ?? []).filter((c) => c.role === "owner" && c.active);
        const destinations = routeToOwners(owners, kind);
        const active = form.enabled && form.owners_enabled;
        return <li key={kind} className="py-2 text-sm"><div className="font-medium">{KIND_LABELS[kind]}</div><p className="mt-1 break-words text-xs text-muted-foreground">{!active ? "توجيه المالك موقوف" : !destinations.length ? "لا يوجد رقم مالك مفعّل" : destinations.map((c) => c.display_name || `+${c.phone}`).join("، ")}</p></li>;
      })}</ul>}
      {canEdit && <Button type="submit" className="w-full" disabled={save.isPending || Boolean(data && Object.keys(form).every((key) => JSON.stringify(form[key as keyof SettingsForm]) === JSON.stringify(data[key as keyof SettingsForm])))}>{save.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</Button>}
    </FormCard>
  );
}
