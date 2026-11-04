import { Printer, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { voucherToText, type VoucherModel } from "@/lib/voucher";
import { PaperFooter, PaperHeader, PaperWatermark } from "@/components/paper-sheet";

/** سند مطبوع بنمط السندات الورقية: ترويسة بالاسمين والشعار، خانات الرقم والتاريخ والمبلغ، ثم البيانات والتواقيع. */
export function VoucherCard({ model }: { model: VoucherModel }) {
  async function share() {
    const text = voucherToText(model);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: model.title, text });
        return;
      } catch {
        // المستخدم ألغى مشاركة الجوال — نفتح واتساب بدلًا منها
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  const printedAt = new Date().toLocaleString("en-GB", { hour12: true });
  const rows = model.rows.filter((r) => !["المبلغ", "العملة"].includes(r.label));

  return (
    <div className="voucher voucher-paper relative overflow-hidden bg-paper p-4 text-foreground">
      <PaperWatermark />

      {/* الترويسة */}
      <PaperHeader />

      <div className="voucher-frame relative">
        {/* خانات الرقم والعنوان والتاريخ والمبلغ */}
        <div className="grid grid-cols-2 items-end gap-2 border-b border-foreground/70 p-2 sm:grid-cols-[auto_1fr_auto]">
          <div className="text-center">
            <p className="text-[10px] font-bold">رقم السند</p>
            <p className="voucher-box ledger-figures min-w-24 text-lg font-bold text-destructive">{model.number}</p>
          </div>
          <div className="col-span-2 row-start-1 text-center sm:col-span-1 sm:row-auto">
            <p className="ledger-figures text-[11px] font-bold">التاريخ: <span dir="ltr">{model.date}</span></p>
            <p className="voucher-box break-words text-lg font-extrabold">{model.title}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold">{model.currency || "المبلغ"}</p>
            <p className="voucher-box ledger-figures min-w-24 text-lg font-bold text-primary" dir="ltr">{model.amountFigure ?? ""}</p>
          </div>
        </div>

        {/* البيانات */}
        <dl className="grid gap-x-6 gap-y-2 p-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-2">
              <dt className="shrink-0 text-xs font-bold">{row.label} :</dt>
              <dd className="voucher-line ledger-figures min-w-0 flex-1 break-words text-sm font-semibold">{row.value || "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-2 px-3 pb-3">
          <span className="shrink-0 text-xs font-bold">مبلغ وقدره :</span>
          <p className="voucher-box flex-1 text-sm font-bold">{model.amountWords}</p>
        </div>

        {/* التواقيع: إشعارات المدين/الدائن من الحساب بدون توقيع */}
        {!(model.kind === "journal" || model.title.includes("إشعار")) && (
          <div className="grid grid-cols-2 gap-6 border-t border-foreground/70 p-3 text-xs font-bold">
            <div><p>اسم العميل : <span className="voucher-line inline-block w-28" /></p><p className="mt-2">التوقيع</p><div className="voucher-box mt-1 h-8" /></div>
            <div><p>المدير : <span className="voucher-line inline-block w-28" /></p><p className="mt-2">التوقيع</p><div className="voucher-box mt-1 h-8" /></div>
          </div>
        )}

        <PaperFooter
          staff={model.staff || null}
          printedAt={printedAt}
          qrValue={`${model.title} | ${model.number} | ${model.date} | ${model.amountFigure ?? ""} ${model.currency ?? ""}`}
        />
      </div>

      <div className="no-print mt-4 grid grid-cols-2 gap-2">
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" />
          طباعة
        </Button>
        <Button type="button" variant="outline" onClick={share}>
          <Share2 className="size-4" />
          مشاركة واتساب
        </Button>
      </div>
    </div>
  );
}
