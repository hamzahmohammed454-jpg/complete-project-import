import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { createFileRoute } from "@tanstack/react-router";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { discardItem, retryItem, syncOutbox } from "@/lib/offline/network";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui-kit";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";
import { dependentItemIds } from "@/lib/offline/outbox-core";

export const Route = createFileRoute("/_authenticated/sync")({
  head: () => ({
    meta: [
      { title: "قائمة المزامنة — ابو طه للصرافة" },
      { name: "description", content: "العمليات المسجّلة بدون إنترنت وحالة إرسالها للخادم." },
      { property: "og:title", content: "قائمة المزامنة — ابو طه للصرافة" },
      { property: "og:description", content: "العمليات المسجّلة بدون إنترنت وحالة إرسالها للخادم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncPage,
});

const STATUS = { pending: "بانتظار الإرسال", syncing: "جارٍ الإرسال", failed: "مرفوضة" } as const;

function SyncPage() {
  const { online, items, cache } = useOfflineStatus();
  const sending = items.some((item) => item.status === "syncing");
  const date = (value: number | null) => value ? new Date(value).toLocaleString("ar") : "لم يحدث بعد";
  return (
    <div className="space-y-4">
      <h1 className="display text-xl font-bold">قائمة المزامنة</h1>
      <Notice tone="info">
        {online ? "متصل بالإنترنت." : "غير متصل بالإنترنت."} العمليات المنتظرة لم تُرحّل ماليًا؛ الأرقام
        النهائية والأرصدة تعتمد بعد قبول النظام للإرسال.
      </Notice>
      <dl className="grid gap-2 border-y border-border py-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>آخر قراءة محفوظة</dt><dd className="ledger-figures">{date(cache.lastReadAt)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>آخر إرسال مقبول</dt><dd className="ledger-figures">{date(cache.lastSyncAt)}</dd></div>
        <div className="flex justify-between gap-2"><dt>بانتظار الإرسال / تحتاج مراجعة</dt><dd className="ledger-figures">{items.filter((item) => item.status === "pending").length} / {items.filter((item) => item.status === "failed").length}</dd></div>
      </dl>
      {!online && <Notice tone="warn">الأرصدة المحفوظة ليست مباشرة. صرف الحوالات وإلغاؤها والترحيل والإقفال وتعديل الصلاحيات تحتاج اتصالًا.</Notice>}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عمليات بانتظار المزامنة.</p>
      ) : (
        <>
          <Button disabled={!online || sending} onClick={() => confirmOperation("إرسال العمليات المحفوظة", () => { void syncOutbox().catch(() => toast.error("تعذّر الإرسال؛ راجع العمليات المنتظرة")); })}><RefreshCw className="size-4" />إرسال الآن</Button>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{i + 1}. {it.label}</p>
                  <span className={it.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{STATUS[it.status]}</span>
                </div>
                <p className="ledger-figures mt-1 text-xs text-muted-foreground">
                  الرقم: قيد المزامنة · {new Date(it.createdAt).toLocaleString("ar")}
                </p>
                {it.error && <p className="mt-2 text-sm text-destructive">{it.error}</p>}
                {it.body && <p className="mt-1 break-words text-xs text-muted-foreground">{(() => { try { const row = JSON.parse(it.body); return [row.full_name ?? row.cash_customer_name ?? row.sender_name, row.receiver_name, row.amount != null ? `المبلغ: ${row.amount}` : null, row.the_date].filter(Boolean).join(" · "); } catch { return ""; } })()}</p>}
                {it.status === "failed" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={!online || sending} onClick={() => confirmOperation("إعادة إرسال العملية", () => { void retryItem(it.id).catch(() => toast.error("تعذّرت إعادة المحاولة")); })}><RefreshCw className="size-4" />إعادة المحاولة</Button>
                    <Button size="sm" variant="outline" disabled={sending || dependentItemIds(items, it.id).size > 0} onClick={async () => { if (await confirmAsk("حذف الطلب من الهاتف؟ قد تكون العملية وصلت للنظام قبل انقطاع الرد؛ الحذف هنا لا يلغي أي عملية مرحّلة.")) void discardItem(it.id).catch((error) => toast.error(error instanceof Error ? error.message : "تعذّر الحذف")); }}><Trash2 className="size-4" />حذف من الهاتف</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
