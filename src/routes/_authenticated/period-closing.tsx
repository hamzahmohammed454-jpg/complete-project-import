import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Field, FormCard, IconTile, LoadingRows, Notice, Td, Tr, selectCls } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { adenDate } from "@/lib/closing";
import { PERIOD_TYPES, suggestRange, type PeriodType } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/period-closing")({
  head: () => ({ meta: [{ title: "الإقفال المحاسبي — ابو طه للصرافة" }, { name: "description", content: "مراجعة فترات الإقفال المحاسبي والقيود المرتبطة بها." }, { property: "og:title", content: "الإقفال المحاسبي — ابو طه للصرافة" }, { property: "og:description", content: "مراجعة فترات الإقفال المحاسبي والقيود المرتبطة بها." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PeriodClosingScreen,
});

type Closing = {
  id: number;
  period_type: string;
  from_date: string;
  to_date: string;
  entry_id: number | null;
  created_at: string;
};

function PeriodClosingScreen() {
  const qc = useQueryClient();
  const { isAdmin, isManager } = useAppRoles();
  const canClose = isAdmin || isManager;

  const [type, setType] = useState<PeriodType>("يومي");
  const [range, setRange] = useState(() => suggestRange("يومي", adenDate()));

  const closings = useQuery({
    queryKey: ["period_closings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("period_closings")
        .select("id, period_type, from_date, to_date, entry_id, created_at")
        .order("to_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Closing[];
    },
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("close_period", { p_type: type, p_from: range.from, p_to: range.to });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أُقفلت الفترة وأُنشئ قيد الأرباح والخسائر");
      qc.invalidateQueries({ queryKey: ["period_closings"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إقفال الفترة"),
  });

  const pickType = (t: PeriodType) => {
    setType(t);
    setRange(suggestRange(t, adenDate()));
  };

  return (
    <>
      <MenuStrip tab="/accounts" />
      <SectionIntro
        title="الإقفال المحاسبي"
        subtitle="إقفال فترة يمنع أي قيد جديد داخلها، وينشئ قيد أرباح وخسائر ينقل نتيجة الفترة إلى حساب الأرباح."
      />

      {!canClose ? (
        <Notice tone="info">الإقفال المحاسبي متاح للمدير فقط.</Notice>
      ) : (
        <FormCard
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            close.mutate();
          }}
        >
          <Field label="نوع الفترة">
            <select className={selectCls} value={type} onChange={(e) => pickType(e.target.value as PeriodType)}>
              {PERIOD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="من يوم">
              <Input
                type="date"
                required
                value={range.from}
                onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
                className="ledger-figures"
              />
            </Field>
            <Field label="إلى يوم">
              <Input
                type="date"
                required
                max={adenDate()}
                value={range.to}
                onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
                className="ledger-figures"
              />
            </Field>
          </div>
          <Button type="submit" disabled={close.isPending} className="w-full">
            <LockKeyhole className="size-4" />
            {close.isPending ? "جارٍ الإقفال…" : "إقفال الفترة"}
          </Button>
        </FormCard>
      )}

      {closings.isLoading ? (
        <LoadingRows rows={3} />
      ) : (closings.data ?? []).length === 0 ? (
        <Notice tone="info">لا توجد فترات مقفلة بعد.</Notice>
      ) : (
        <DataTable head={["الفترة", "المدى", "قيد الإقفال", "أُقفلت في"]}>
          {(closings.data ?? []).map((c) => (
            <Tr key={c.id}>
              <Td>
                <span className="inline-flex items-center gap-2 font-medium">
                  <IconTile icon={LockKeyhole} tone="rose" size="sm" />
                  {c.period_type}
                </span>
              </Td>
              <Td className="ledger-figures text-xs">
                {c.from_date} ← {c.to_date}
              </Td>
              <Td className="ledger-figures">{c.entry_id ?? "—"}</Td>
              <Td className="ledger-figures text-xs">{c.created_at.slice(0, 10)}</Td>
            </Tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
