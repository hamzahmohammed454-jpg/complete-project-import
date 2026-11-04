import { confirmOperation } from "@/lib/operation-confirmation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { boxErrorMessage } from "@/components/box-select";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormCard, selectCls } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/money";

export const OPENING_NOTE = "رصيد افتتاحي";

export const Route = createFileRoute("/_authenticated/getting-started")({
  head: () => ({ meta: [{ title: "الإعداد الأولي — ابو طه للصرافة" }, { name: "description", content: "خطوات إنشاء الصناديق وإدخال الأرصدة الافتتاحية قبل تسجيل الحوالات." }, { property: "og:title", content: "الإعداد الأولي — ابو طه للصرافة" }, { property: "og:description", content: "جهّز الصناديق والأرصدة الافتتاحية." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: GettingStarted,
});

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        {done ? <CheckCircle2 className="size-5 text-positive" /> : <Circle className="size-5 text-muted-foreground" />}
        الخطوة {n}: {title}
      </h2>
      {children}
    </section>
  );
}

function GettingStarted() {
  const qc = useQueryClient();
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => (await supabase.from("currencies").select("id, currency_name").order("the_number")).data ?? [],
  });
  const { data: boxes = [] } = useQuery({
    queryKey: ["boxes"],
    queryFn: async () => (await supabase.from("boxes").select("id, box_name").order("the_number")).data ?? [],
  });
  const { data: openings = [] } = useQuery({
    queryKey: ["opening-balances"],
    queryFn: async () =>
      (await supabase.from("box_movements").select("id, box_id, amount, currency_id").eq("notes", OPENING_NOTE).order("id")).data ?? [],
  });

  const [boxName, setBoxName] = useState("");
  const addBox = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("boxes").insert({ box_name: boxName.trim(), the_number: 0 });
      if (error) throw error;
    },
    onSuccess: () => { setBoxName(""); qc.invalidateQueries({ queryKey: ["boxes"] }); toast.success("أُضيف الصندوق"); },
    onError: () => toast.error("تعذّر إضافة الصندوق"),
  });

  const [ob, setOb] = useState({ box_id: "", currency_id: "", amount: "" });
  const addOpening = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("box_movements").insert({
        box_id: Number(ob.box_id), currency_id: Number(ob.currency_id), amount: Number(ob.amount), movement_type: "قبض", notes: OPENING_NOTE,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOb({ ...ob, amount: "" });
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
      qc.invalidateQueries({ queryKey: ["box_day_summary"] });
      toast.success("سُجّل الرصيد الافتتاحي");
    },
    onError: (e) => toast.error(boxErrorMessage(e)),
  });

  const boxName_ = (id: number) => boxes.find((b) => b.id === id)?.box_name ?? "";
  const curName = (id: number | null) => currencies.find((c) => c.id === id)?.currency_name ?? "";

  return (
    <>
      <SectionIntro title="الإعداد الأولي" subtitle="أكمل هذه الخطوات بالترتيب قبل تسجيل أول حوالة." />

      <Step n={1} done={currencies.length > 0} title="العملات">
        <p className="mb-2 text-sm text-muted-foreground">{currencies.length ? `لديك ${currencies.length} عملة: ${currencies.map((c) => c.currency_name).join("، ")}` : "لم تُضف أي عملة بعد."}</p>
        <Button asChild variant="outline" size="sm"><Link to="/currencies">إدارة العملات</Link></Button>
      </Step>

      <Step n={2} done={boxes.length > 0} title="الصناديق">
        {boxes.length > 0 && <p className="mb-2 text-sm">{boxes.map((b) => b.box_name).join("، ")}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (boxName.trim()) confirmOperation("إضافة الصندوق", () => addBox.mutate()); }} className="flex gap-2">
          <Input value={boxName} onChange={(e) => setBoxName(e.target.value)} placeholder="اسم الصندوق، مثل: الصندوق الرئيسي" />
          <Button type="submit" disabled={addBox.isPending || !boxName.trim()}>إضافة</Button>
        </form>
      </Step>

      <Step n={3} done={openings.length > 0} title="الأرصدة الافتتاحية">
        <p className="mb-3 text-xs text-muted-foreground">أدخل النقد الموجود فعليًا في كل صندوق بكل عملة اليوم. يُسجَّل كقبض بعنوان «رصيد افتتاحي».</p>
        {boxes.length === 0 || currencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">أكمل الخطوتين 1 و2 أولًا.</p>
        ) : (
          <FormCard onSubmit={(e) => { e.preventDefault(); addOpening.mutate(); }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="الصندوق">
                <select required className={selectCls} value={ob.box_id} onChange={(e) => setOb({ ...ob, box_id: e.target.value })}>
                  <option value="">اختر</option>
                  {boxes.map((b) => <option key={b.id} value={b.id}>{b.box_name}</option>)}
                </select>
              </Field>
              <Field label="العملة">
                <select required className={selectCls} value={ob.currency_id} onChange={(e) => setOb({ ...ob, currency_id: e.target.value })}>
                  <option value="">اختر</option>
                  {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="المبلغ">
              <Input required inputMode="decimal" value={ob.amount} onChange={(e) => setOb({ ...ob, amount: e.target.value })} className="ledger-figures" placeholder="0" />
            </Field>
            <Button type="submit" disabled={addOpening.isPending || !(Number(ob.amount) > 0)}>حفظ الرصيد</Button>
          </FormCard>
        )}
        {openings.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {openings.map((o) => (
              <li key={o.id} className="flex justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span>{boxName_(o.box_id)}</span>
                <span className="ledger-figures font-semibold">{fmt(Number(o.amount))} {curName(o.currency_id)}</span>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={4} done={false} title="أرصدة العملاء والوكلاء الافتتاحية">
        <PartyOpening currencies={currencies} />
      </Step>

      <Step n={5} done={false} title="ابدأ العمل">
        <Button asChild className="w-full" disabled={!openings.length}>
          <Link to="/transfers" search={{ dir: "outgoing" } as never}>تسجيل أول حوالة</Link>
        </Button>
      </Step>
    </>
  );
}

/** رصيد افتتاحي لعميل أو وكيل: قيد متوازن مقابل حساب «رأس المال»، لا يحرّك الصندوق. */
function PartyOpening({ currencies }: { currencies: { id: number; currency_name: string }[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ party: "", currency_id: "", amount: "", side: "عليه" as "عليه" | "له" });
  const { data } = useQuery({
    queryKey: ["opening-parties"],
    queryFn: async () => {
      const [c, a, cap] = await Promise.all([
        supabase.from("customers").select("id, full_name, account_id").order("full_name"),
        supabase.from("agents").select("id, agent_name, account_id").order("agent_name"),
        supabase.from("accounts").select("id").eq("account_number", 31).maybeSingle(),
      ]);
      if (c.error) throw c.error;
      if (a.error) throw a.error;
      const parties = [
        ...(c.data ?? []).filter((x) => x.account_id).map((x) => ({ key: `c${x.id}`, name: `عميل: ${x.full_name}`, account_id: x.account_id as number })),
        ...(a.data ?? []).filter((x) => x.account_id).map((x) => ({ key: `a${x.id}`, name: `وكيل: ${x.agent_name}`, account_id: x.account_id as number })),
      ];
      return { parties, capitalId: cap.data?.id ?? null };
    },
  });
  const m = useMutation({
    mutationFn: async () => {
      const party = data?.parties.find((p) => p.key === f.party);
      if (!party || !data?.capitalId) throw new Error("no-capital");
      const amount = Number(f.amount);
      const cur = Number(f.currency_id);
      const partySide = f.side === "عليه" ? "مدين" : "دائن";
      const capSide = partySide === "مدين" ? "دائن" : "مدين";
      const { error } = await supabase.rpc("create_balanced_entry", {
        p_entry_number: 0,
        p_the_date: new Date().toISOString().slice(0, 10),
        p_notes: `${OPENING_NOTE} — ${party.name}`,
        p_branch_id: null as unknown as number,
        p_details: [
          { side: partySide, amount, account_id: party.account_id, currency_id: cur, notes: OPENING_NOTE },
          { side: capSide, amount, account_id: data.capitalId, currency_id: cur, notes: OPENING_NOTE },
        ],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حُفظ الرصيد الافتتاحي");
      qc.invalidateQueries();
      setF({ ...f, party: "", amount: "" });
    },
    onError: (e: Error) => toast.error(e.message === "no-capital" ? "لا يوجد حساب «رأس المال» في الدليل" : "تعذّر الحفظ — تأكد من البيانات وصلاحيتك"),
  });
  if (!data) return null;
  if (data.parties.length === 0) return <p className="text-sm text-muted-foreground">أضف العملاء أو الوكلاء أولًا، ثم ارجع هنا.</p>;
  return (
    <FormCard onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <p className="text-xs text-muted-foreground">الدين اللي على العميل أو له قبل بدء النظام. يُسجَّل مقابل «رأس المال» ولا يحرّك الصندوق.</p>
      <Field label="العميل أو الوكيل">
        <select required className={selectCls} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })}>
          <option value="">اختر</option>
          {data.parties.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="العملة">
          <select required className={selectCls} value={f.currency_id} onChange={(e) => setF({ ...f, currency_id: e.target.value })}>
            <option value="">اختر</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.currency_name}</option>)}
          </select>
        </Field>
        <Field label="المبلغ">
          <Input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="ledger-figures" placeholder="0" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["عليه", "له"] as const).map((s) => (
          <Button key={s} type="button" variant={f.side === s ? "default" : "outline"} onClick={() => setF({ ...f, side: s })}>
            {s === "عليه" ? "عليه (مدين لنا)" : "له (دائن علينا)"}
          </Button>
        ))}
      </div>
      <Button type="submit" disabled={m.isPending || !(Number(f.amount) > 0)}>حفظ الرصيد الافتتاحي</Button>
    </FormCard>
  );
}
