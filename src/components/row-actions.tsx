import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

/** تعديل / حذف لكل سطر. الحذف يطلب تأكيدًا قبل التنفيذ. */
export function RowActions({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  pending,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  pending?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!canEdit && !canDelete) return null;
  if (confirm) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-destructive">متأكد؟</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => { onDelete(); setConfirm(false); }}
          className="rounded-lg bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground"
        >
          نعم، احذف
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-border px-2 py-1 text-[11px]">
          تراجع
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {canEdit && (
        <button type="button" onClick={onEdit} aria-label="تعديل" className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-primary">
          <Pencil className="size-3" /> تعديل
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={() => setConfirm(true)} aria-label="حذف" className="flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive">
          <Trash2 className="size-3" /> حذف
        </button>
      )}
    </div>
  );
}
