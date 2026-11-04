import { QRCodeSVG } from "qrcode.react";

import exchangeEmblem from "@/assets/abu-taha-emblem-3d-notes.png";

/** هاتف المحل المطبوع على السندات وكشوف الحساب. */
export const PAPER_PHONE = "774379751";

/** ترويسة الورقة: الاسم العربي يميناً والشعار في الوسط والاسم الإنجليزي يساراً. */
export function PaperHeader() {
  return (
    <header className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-3">
      <div className="text-start">
        <p className="brand-title text-lg sm:text-xl">ابو طه للصرافة</p>
        <p className="text-[11px] font-semibold text-muted-foreground">للصرافة والتحويلات المالية</p>
      </div>
      <img src={exchangeEmblem} alt="شعار ابو طه للصرافة" width={1024} height={1024} loading="lazy" className="size-12 object-contain drop-shadow-md sm:size-16" />
      <div className="text-end" dir="ltr">
        <p className="text-sm font-extrabold sm:text-base">Abu Taha Exchange</p>
        <p className="text-[11px] font-semibold text-muted-foreground">Exchange & Transfers</p>
      </div>
    </header>
  );
}

/** علامة مائية باهتة خلف محتوى الورقة. */
export function PaperWatermark() {
  return <img src={exchangeEmblem} alt="" aria-hidden className="voucher-watermark pointer-events-none absolute inset-0 m-auto w-1/2 object-contain" />;
}

/** تذييل الورقة: الفرع والهاتف والموظف ووقت الطباعة مع رمز QR. */
export function PaperFooter({
  qrValue,
  staff,
  printedAt,
  size = 56,
}: {
  qrValue: string;
  staff?: string | null;
  printedAt: string;
  size?: number;
}) {
  return (
    <footer className="flex items-center justify-between gap-2 border-t border-foreground/70 px-3 py-1.5 text-[10px] font-bold">
      <div className="grid gap-1">
        <span>
          الفرع: المركز الرئيسي · هاتف: <span className="ledger-figures" dir="ltr">{PAPER_PHONE}</span>
        </span>
        <span>
          {staff ? <>الموظف: <span dir="ltr">{staff}</span> · </> : null}
          <span className="ledger-figures" dir="ltr">{printedAt}</span>
        </span>
      </div>
      <div className="rounded bg-background p-1">
        <QRCodeSVG value={qrValue} size={size} />
      </div>
    </footer>
  );
}
