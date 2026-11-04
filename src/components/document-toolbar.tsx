import { FilePlus2, Pencil, Printer, RefreshCw, Search, Trash2, FileText } from "lucide-react";
import { confirmAsk } from "@/components/confirm-dialog";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * شريط أوامر المستندات الموحّد: إضافة، تعديل، حذف، تحديث، بحث، طباعة، طباعة السند، خروج.
 * تعديل/حذف/طباعة السند تعمل على السند المحدد (اضغط على السند في القائمة لتحديده).
 */
export function DocumentToolbar({
  selected,
  canCreate,
  canDelete,
  canPrint = true,
  adding,
  onAdd,
  onDelete,
  onRefresh,
  onSearch,
  onPrintVoucher,
  editNote = "السند المرحّل لا يُعدّل حفاظًا على الصندوق وكشف الحساب؛ احذفه وأعد إدخاله.",
  onEdit,
}: {
  selected: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canPrint?: boolean;
  adding?: boolean;
  onAdd: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onSearch: () => void;
  onPrintVoucher?: () => void;
  editNote?: string;
  onEdit?: () => void;
}) {
  const pick = () => toast.info("اختر سندًا من القائمة أولًا");
  return (
    <div className="mb-3 grid gap-2 print:hidden" role="toolbar" aria-label="أوامر المستند">
      <div className="flex items-center justify-between gap-2">
        <Pill icon={<FilePlus2 className="size-4" />} label={adding ? "إغلاق" : "إضافة"} disabled={!canCreate} onClick={onAdd} />
        <Pill icon={<Search className="size-4" />} label="عرض" onClick={onSearch} />
      </div>
      <div className="flex items-center justify-around rounded-full border border-border bg-card px-2 py-1 shadow-card">
        <Ico icon={<Pencil className="size-5" />} label="تعديل" onClick={() => (!selected ? pick() : onEdit ? onEdit() : toast.info(editNote))} />
        <Ico icon={<Trash2 className="size-5" />} label="حذف" tone="danger" disabled={!canDelete} onClick={async () => { if (!selected) { pick(); return; } if (await confirmAsk("حذف السند المحدد؟ تُحذف حركته معه.")) onDelete(); }} />
        <Ico icon={<RefreshCw className="size-5" />} label="تحديث" onClick={onRefresh} />
        <Ico icon={<Printer className="size-5" />} label="طباعة" disabled={!canPrint} onClick={() => window.print()} />
        <Ico icon={<FileText className="size-5" />} label="طباعة السند" disabled={!canPrint} onClick={() => (!selected ? pick() : onPrintVoucher ? onPrintVoucher() : window.print())} />
      </div>
    </div>
  );
}

function Pill({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2 text-sm font-bold shadow-float transition active:scale-95 disabled:opacity-40">{icon}{label}</button>;
}

function Ico({ icon, label, onClick, disabled, tone }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: "danger" }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={cn("rounded-full p-2 text-primary transition active:scale-90 disabled:opacity-30", tone === "danger" && "text-destructive")}>{icon}</button>;
}

export function Btn({ icon, label, onClick, disabled, tone }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: "danger" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-card px-1 py-2 text-[11px] font-medium text-primary shadow-card transition active:scale-95 disabled:opacity-40",
        tone === "danger" && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** صنف تمييز السند المحدد في القائمة. */
export const selectedRowCls = "ring-2 ring-primary";
