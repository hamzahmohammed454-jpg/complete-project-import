import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Wallet } from "lucide-react";
import { useMemo } from "react";

import { Notice, SectionCard } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { fmt } from "@/lib/money";
import { GROUPS, ICON } from "@/lib/home-groups";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "الرئيسية — ابو طه للصرافة" }, { name: "description", content: "مربعات النظام السريعة وأرصدة الصناديق." }, { property: "og:title", content: "الرئيسية — ابو طه للصرافة" }, { property: "og:description", content: "مربعات النظام السريعة وأرصدة الصناديق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: HomeScreen,
});

const TILE_CLS =
  "group flex h-full min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-card px-1.5 py-3 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-gold/60 active:scale-[0.97]";

const JAIB_TILE =
  "flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-2xl bg-card px-2 py-4 text-center shadow-sm transition-transform active:scale-[0.96]";


function HomeScreen() {
  const today = adenDate();

  const { data: pending = 0 } = useQuery({
    queryKey: ["home", "transfers-pending"],
    queryFn: async () => {
      const [out_, in_] = await Promise.all([
        supabase.from("outgoing_transfers").select("id", { count: "exact", head: true }).eq("delivered", false).eq("canceled", false),
        supabase.from("incoming_transfers").select("id", { count: "exact", head: true }).eq("delivered", false).eq("canceled", false).is("internal_outgoing_id", null),
      ]);
      return (out_.count ?? 0) + (in_.count ?? 0);
    },
  });

  // أرصدة الصناديق بكل عملة (محسوبة في القاعدة)
  const { data: boxSummary = [] } = useQuery({
    queryKey: ["box_day_summary", today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("box_day_summary", { p_date: today });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: boxes = [], isFetched: boxesFetched } = useQuery({
    queryKey: ["boxes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boxes").select("id, box_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("id, currency_name").order("the_number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const curName = (id: number | null) => currencies.find((c) => c.id === id)?.currency_name ?? "";

  const boxBalances = useMemo(() => {
    const byBox = new Map<number, { currency: string; amount: number }[]>();
    for (const r of boxSummary) {
      const closing = Number(r.closing);
      if (closing === 0) continue;
      const list = byBox.get(r.box_id) ?? [];
      list.push({ currency: curName(r.currency_id), amount: closing });
      byBox.set(r.box_id, list);
    }
    return byBox;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxSummary, currencies]);


  // تنبيه: حسابات تجاوزت سقفها
  const { data: overCeilingCount = 0 } = useQuery({
    queryKey: ["home", "over-ceiling"],
    queryFn: async () => {
      const [accs, moves] = await Promise.all([
        supabase.from("accounts").select("id, ceiling_amount, ceiling_currency_id").not("ceiling_amount", "is", null),
        supabase.from("entries_details").select("account_id, currency_id, side, amount"),
      ]);
      if (accs.error) throw accs.error;
      if (moves.error) throw moves.error;
      const nets = new Map<string, number>();
      for (const r of moves.data ?? []) {
        if (r.account_id == null) continue;
        const k = `${r.account_id}|${r.currency_id ?? 0}`;
        nets.set(k, (nets.get(k) ?? 0) + (r.side === "مدين" ? Number(r.amount) : -Number(r.amount)));
      }
      return (accs.data ?? []).filter(
        (a) => a.ceiling_amount != null && (nets.get(`${a.id}|${a.ceiling_currency_id ?? 0}`) ?? 0) > a.ceiling_amount,
      ).length;
    },
  });

  return (
    <>

      {(pending > 0 || overCeilingCount > 0) && (
        <div className="mb-4 grid gap-2">
          {pending > 0 && (
            <Link to="/transfers" search={{ dir: "incoming" }}>
              <Notice tone="warn" icon={AlertTriangle}>
                {fmt(pending)} حوالة معلّقة بانتظار التسليم — اضغط لمراجعتها.
              </Notice>
            </Link>
          )}
          {overCeilingCount > 0 && (
            <Link to="/accounts">
              <Notice tone="danger" icon={AlertTriangle}>
                {fmt(overCeilingCount)} حساب تجاوز سقفه المحدد — اضغط لعرض شجرة الحسابات.
              </Notice>
            </Link>
          )}
        </div>
      )}

      {boxesFetched && boxes.length === 0 && (
        <Link
          to="/getting-started"
          className="mb-5 block rounded-3xl bg-gold-gradient p-px shadow-float transition-transform active:scale-[0.985]"
        >
          <div className="flex items-center gap-3 rounded-[calc(1.5rem-1px)] bg-brand px-4 py-4 text-primary-foreground">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
              <img src={ICON("setup")} alt="" width={48} height={48} className="size-8 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-bold tracking-wide text-gold">الخطوة الأولى</span>
              <span className="block text-base font-bold">الإعداد الأولي</span>
              <span className="mt-1 block text-xs leading-relaxed text-primary-foreground/75">
                أنشئ الصناديق وأدخل الأرصدة الافتتاحية قبل تسجيل أول حوالة.
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-2 text-sm font-bold text-gold-foreground">
              ابدأ الآن
              <ArrowLeft className="size-4" />
            </span>
          </div>
        </Link>
      )}

      <ul className="mb-6 grid grid-cols-3 gap-3">

        {GROUPS.map((g) => (
          <li key={g.id}>
            <Link to="/section/$id" params={{ id: g.id }} className={JAIB_TILE}>
              <img src={ICON(g.img)} alt="" width={56} height={56} className="size-12 object-contain" />
              <span className="text-balance text-sm font-semibold leading-tight text-foreground">{g.title}</span>
            </Link>
          </li>
        ))}
      </ul>

      <SectionCard title="أرصدة الصناديق" aside="اليوم">
        {boxBalances.size === 0 ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="size-4" />
            لا حركات على الصناديق بعد اليوم.
          </p>
        ) : (
          <ul className="grid gap-2">
            {boxes
              .filter((b) => boxBalances.has(b.id))
              .map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">{b.box_name}</span>
                  <span className="flex flex-wrap gap-2">
                    {(boxBalances.get(b.id) ?? []).map((r) => (
                      <span key={r.currency} className="ledger-figures rounded-lg bg-card px-2 py-0.5 text-xs font-semibold shadow-card">
                        {fmt(r.amount)} <span className="font-normal text-muted-foreground">{r.currency}</span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

    </>
  );
}
