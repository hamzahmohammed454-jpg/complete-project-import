import { MessageCircle, Printer } from "lucide-react";

import { useEffect, useState } from "react";

import { DEFAULT_PREFS, loadPrefs, type AppPrefs } from "@/lib/app-prefs";
import { Button } from "@/components/ui/button";
import { PaperFooter, PaperHeader, PaperWatermark } from "@/components/paper-sheet";
import { money, noticeToText, type AccountNotice } from "@/lib/voucher";
import { waLinkOrPicker } from "@/lib/whatsapp";

/** إشعار مدين/دائن بنمط الإشعارات الورقية للعمليات المقيدة على حساب العميل. */
export function AccountNoticeCard({ notice, prefs: given }: { notice: AccountNotice; prefs?: AppPrefs }) {
  const [saved, setSaved] = useState<AppPrefs>(DEFAULT_PREFS);
  useEffect(() => setSaved(loadPrefs()), []);
  const p = given ?? saved;
  const fee = p.noticeShowFee ? notice.fee : undefined;
  const intro = notice.side === "credit"
    ? p.noticeCreditIntro.trim() || "نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية"
    : p.noticeDebitIntro.trim() || "نود إشعاركم أننا قيدنا على حسابكم لدينا";
  const printedAt = new Date().toLocaleString("en-GB", { hour12: true });
  const title = p.useVoucherNameTitle ? (notice.side === "credit" ? "سند قبض" : "سند صرف") : notice.title;
  const cell = "border border-foreground/70 px-2 py-1.5 text-center";
  return (
    <div className="voucher voucher-paper relative overflow-hidden bg-paper p-4 text-foreground">
      <PaperWatermark />
      <PaperHeader />
      <div className="voucher-frame relative space-y-2 p-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <p className="voucher-box ledger-figures text-sm font-bold">رقم المستند : {notice.number}</p>
          <p className="rounded-xl bg-primary px-5 py-1.5 text-center text-lg font-extrabold text-primary-foreground" style={{ background: "var(--voucher-accent, var(--primary))" }}>{title}</p>
          <p className="voucher-box ledger-figures text-sm font-bold">التاريخ : <span dir="ltr">{notice.date}</span></p>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto_auto] border border-foreground/70 text-sm font-bold">
          <span className="border-l border-foreground/70 px-2 py-1.5">عميلنا</span>
          <span className="px-2 py-1.5">{notice.party}</span>
          {p.noticeShowAccount ? <><span className="border-x border-foreground/70 px-2 py-1.5">رقم الحساب :</span>
          <span className="ledger-figures px-3 py-1.5">{notice.accountNumber}</span></> : <><span /><span /></>}
        </div>
        <table className="w-full border-collapse text-sm font-bold">
          <tbody>
            <tr><td colSpan={fee ? 3 : 2} className={cell}>{intro}</td></tr>
            <tr><td className={cell}>مبلغ الحساب</td>{fee ? <td className={cell}>خدمات التحويل</td> : null}<td className={cell}>عملة الحساب</td></tr>
            <tr>
              <td className={`${cell} ledger-figures`}>{money(notice.amount)}</td>
              {fee ? <td className={`${cell} ledger-figures`}>{money(fee)}</td> : null}
              <td className={cell}>{notice.currency}</td>
            </tr>
            {fee ? <tr><td className={cell}>الإجمالي</td><td colSpan={2} className={`${cell} ledger-figures`}>{money(notice.amount + fee)} {notice.currency}</td></tr> : null}
            {p.noticeShowWords ? <tr><td colSpan={fee ? 3 : 2} className={cell}>{notice.amountWords}</td></tr> : null}
          </tbody>
        </table>
        {p.noticeShowNarrative && <div className="border border-foreground/70">
          <p className="border-b border-foreground/70 py-1 text-center text-sm font-bold">البيان</p>
          <div className="space-y-1 p-3 text-sm font-semibold">{notice.narrative.map((l, i) => <p key={i} className="ledger-figures">{l}</p>)}</div>
        </div>}
        {p.noticeNote.trim() && <p className="text-center text-xs font-semibold">{p.noticeNote}</p>}
        <PaperFooter staff={notice.staff || null} printedAt={printedAt} qrValue={`${title} | ${notice.number} | ${notice.date} | ${money(notice.amount)} ${notice.currency}`} />
      </div>
      <div className="no-print mt-4 grid grid-cols-2 gap-2">
        <Button type="button" onClick={() => window.print()}><Printer className="size-4" />طباعة</Button>
        <Button type="button" variant="outline" onClick={() => window.open(waLinkOrPicker(notice.phone, noticeToText(notice)), "_blank", "noopener,noreferrer")}>
          <MessageCircle className="size-4" />إرسال للعميل واتساب
        </Button>
      </div>
    </div>
  );
}
