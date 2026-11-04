import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { FormCard, StatusPill } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/app-status")({
  head: () => ({ meta: [{ title: "حالة النشر — ابو طه للصرافة" }, { name: "description", content: "حالة نشر التطبيق ورابطه الدائم." }, { property: "og:title", content: "حالة النشر — ابو طه للصرافة" }, { property: "og:description", content: "رابط التطبيق الدائم وحالته." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AppStatus,
});

/** يميّز نسخة المعاينة عن النسخة المنشورة من اسم الرابط الحالي. */
export function isPreviewHost(host: string) {
  return host.startsWith("id-preview--") || host.includes("lovableproject.com") || host === "localhost" || host.startsWith("127.");
}

function AppStatus() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => { setUrl(window.location.origin); setPreview(isPreviewHost(window.location.hostname)); }, []);

  return (
    <>
      <SectionIntro title="حالة النشر" subtitle="الرابط الذي يفتح منه الموظفون التطبيق." />
      <FormCard onSubmit={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">الحالة</span>
          {url && (preview ? <StatusPill tone="warn">نسخة المعاينة</StatusPill> : <StatusPill tone="ok">منشور</StatusPill>)}
        </div>
        <p dir="ltr" className="ledger-figures break-all text-sm font-semibold">{url}</p>
        <Button type="button" variant="outline" onClick={() => { navigator.clipboard?.writeText(url); toast.success("نُسخ الرابط"); }}>
          <Copy className="size-4" /> نسخ الرابط
        </Button>
        <p className="text-xs text-muted-foreground">
          {preview ? "أنت الآن في نسخة المعاينة. افتح التطبيق من الرابط المنشور لتشاركه مع الموظفين." : "هذا هو الرابط الدائم، شاركه مع الموظفين."}
        </p>
      </FormCard>
    </>
  );
}
