import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/computer")({
  head: () => ({ meta: [{ title: "ربط بالكمبيوتر — ابو طه للصرافة" }, { name: "description", content: "افتح النظام على الكمبيوتر بنفس حسابك." }, { property: "og:title", content: "ربط بالكمبيوتر — ابو طه للصرافة" }, { property: "og:description", content: "استخدم النظام على الكمبيوتر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ComputerScreen,
});

function ComputerScreen() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(window.location.origin), []);

  return (
    <>
      <SectionIntro title="ربط بالكمبيوتر" subtitle="النظام نفسه يعمل على الكمبيوتر، والبيانات متزامنة تلقائيًا." />
      <FormCard onSubmit={(e) => e.preventDefault()}>
        <div className="flex justify-center rounded-2xl bg-white p-4">{url && <QRCodeSVG value={url} size={180} />}</div>
        <p dir="ltr" className="ledger-figures break-all text-center text-sm font-semibold">{url}</p>
        <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard?.writeText(url); toast.success("نُسخ الرابط"); }}>
          <Copy className="size-4" /> نسخ الرابط
        </Button>
      </FormCard>
      <ol className="mt-4 grid list-decimal gap-2 ps-5 text-sm">
        <li>افتح المتصفح على الكمبيوتر (كروم أو إيدج).</li>
        <li>اكتب الرابط أعلاه، أو امسح الرمز بكاميرا جوال آخر.</li>
        <li>ادخل باسم المستخدم وكلمة المرور نفسها.</li>
        <li>لتثبيته كبرنامج: من قائمة المتصفح اختر «تثبيت التطبيق».</li>
      </ol>
    </>
  );
}
