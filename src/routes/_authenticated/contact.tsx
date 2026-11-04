import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";

import { PAPER_PHONE } from "@/components/paper-sheet";
import { SectionIntro } from "@/components/section";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/ui-kit";
import { waLink } from "@/lib/wa-link";

export const Route = createFileRoute("/_authenticated/contact")({
  head: () => ({ meta: [{ title: "تواصل معنا — ابو طه للصرافة" }, { name: "description", content: "أرقام التواصل مع ابو طه للصرافة." }, { property: "og:title", content: "تواصل معنا — ابو طه للصرافة" }, { property: "og:description", content: "اتصل بنا أو راسلنا على واتساب." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ContactScreen,
});

function ContactScreen() {
  return (
    <>
      <SectionIntro title="تواصل معنا" subtitle="ابو طه للصرافة والتحويلات المالية — المركز الرئيسي" />
      <FormCard onSubmit={(e) => e.preventDefault()}>
        <p dir="ltr" className="ledger-figures text-center text-2xl font-bold">{PAPER_PHONE}</p>
        <Button asChild className="w-full"><a href={`tel:${PAPER_PHONE}`}><Phone className="size-4" /> اتصال</a></Button>
        <Button asChild variant="outline" className="w-full">
          <a href={waLink(PAPER_PHONE, "السلام عليكم") ?? "#"} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> مراسلة على واتساب</a>
        </Button>
      </FormCard>
    </>
  );
}
