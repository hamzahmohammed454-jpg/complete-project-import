import { createFileRoute } from "@tanstack/react-router";
import { confirmAsk } from "@/components/confirm-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MenuStrip } from "@/components/menu-strip";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Notice, SectionCard } from "@/components/ui-kit";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/auto-reply")({
  head: () => ({ meta: [{ title: "الرد الآلي — ابو طه للصرافة" }, { name: "description", content: "إعدادات الردود وتعليمات التواصل الخاصة بشركة الصرافة." }, { property: "og:title", content: "الرد الآلي — ابو طه للصرافة" }, { property: "og:description", content: "إعدادات الردود وتعليمات التواصل الخاصة بشركة الصرافة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AutoReplyScreen,
});

function AutoReplyScreen() {
  const { isManager } = useAppRoles();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["auto-reply-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("auto_reply_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const commands = useQuery({
    queryKey: ["auto-reply-commands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("auto_reply_commands").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [hours, setHours] = useState("24");
  useEffect(() => {
    if (!settings.data) return;
    setPhone(settings.data.phone_number);
    setName(settings.data.display_name);
    setHours(String(settings.data.instructions_hours));
  }, [settings.data]);

  const save = async (patch: { phone_number?: string; display_name?: string; instructions_hours?: number; enabled?: boolean; instructions_enabled?: boolean }) => {
    if (!await confirmAsk("تأكيد تغيير إعدادات الرد الآلي؟")) return;
    const { error } = await supabase.from("auto_reply_settings").update(patch).eq("id", 1);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["auto-reply-settings"] });
  };
  const toggleCommand = async (code: number, active: boolean) => {
    if (!await confirmAsk(active ? "تأكيد تفعيل أمر الرد الآلي؟" : "تأكيد إيقاف أمر الرد الآلي؟")) return;
    const { error } = await supabase.from("auto_reply_commands").update({ active }).eq("code", code);
    if (error) { toast.error("تعذر الحفظ"); return; }
    qc.invalidateQueries({ queryKey: ["auto-reply-commands"] });
  };
  const s = settings.data;

  return (
    <div className="space-y-4">
      <MenuStrip tab="/administration" />
      <SectionIntro title="الرد الآلي" subtitle="إعدادات رد واتساب الآلي على العملاء" />
      <Notice>الإعدادات تُحفظ الآن، والإرسال الفعلي يبدأ بعد ربط حساب واتساب للأعمال (مؤجل مع الربط الخارجي).</Notice>
      <SectionCard title="الإعدادات">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>رقم الهاتف المرتبط مع مفتاح الدولة</Label>
            <Input className="ledger-figures" dir="ltr" value={phone} disabled={!isManager} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>الاسم الذي يظهر للعملاء</Label>
            <Input value={name} disabled={!isManager} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ساعات الرد بالتعليمات</Label>
            <Input className="ledger-figures" type="number" min={1} max={720} value={hours} disabled={!isManager} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button disabled={!isManager} onClick={() => save({ phone_number: phone.trim(), display_name: name.trim(), instructions_hours: Math.min(720, Math.max(1, Number(hours) || 24)) })}>
              حفظ الإعدادات
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={!!s?.enabled} disabled={!isManager} onCheckedChange={(v) => save({ enabled: v })} />
            تفعيل الرد الآلي
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={!!s?.instructions_enabled} disabled={!isManager} onCheckedChange={(v) => save({ instructions_enabled: v })} />
            تشغيل رسالة التعليمات
          </label>
        </div>
      </SectionCard>
      <SectionCard title="رسائل الأوامر">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="p-2 text-right">الرسالة</th>
              <th className="p-2 text-right">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(commands.data ?? []).map((c) => (
              <tr key={c.code} className="border-b">
                <td className="p-2">أرسل <span className="ledger-figures">*{c.code}*</span> {c.label}</td>
                <td className="p-2">
                  <label className="flex items-center gap-2">
                    <Switch checked={c.active} disabled={!isManager} onCheckedChange={(v) => toggleCommand(c.code, v)} />
                    {c.active ? "مفعّل" : "معطّل"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
