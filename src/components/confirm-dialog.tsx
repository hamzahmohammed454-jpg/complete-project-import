import { useCallback, useEffect, useRef, useState } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

export type ConfirmOptions = {
  /** Bold headline at the top of the dialog. */
  title?: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmRequest = ConfirmOptions & {
  message: string;
  resolve: (ok: boolean) => void;
};

let enqueue: ((req: ConfirmRequest) => void) | null = null;

/**
 * Classic-style confirmation dialog (question icon + نعم / لا).
 * Resolves true only when confirmed; false on لا, ✕ or Escape.
 */
export function confirmAsk(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!enqueue) return Promise.resolve(window.confirm(message));
  return new Promise<boolean>((resolve) => enqueue!({ ...options, message, resolve }));
}

export function ConfirmDialogHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const answerRef = useRef(false);
  const current = queue[0] ?? null;

  useEffect(() => {
    enqueue = (req) => setQueue((q) => [...q, req]);
    return () => { enqueue = null; };
  }, []);

  const settle = useCallback(() => {
    setQueue((q) => {
      const first = q[0];
      if (first) first.resolve(answerRef.current);
      answerRef.current = false;
      return q.slice(1);
    });
  }, []);

  if (!current) return null;

  return (
    <AlertDialogPrimitive.Root open onOpenChange={(open) => { if (!open) settle(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <AlertDialogPrimitive.Content
          dir="rtl"
          className="fixed left-[50%] top-[50%] z-50 w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background p-4 shadow-2xl outline-none"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="إغلاق"
            onClick={() => settle()}
            className="absolute left-2 top-1.5 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
          <div className="flex items-center gap-3 px-1 pt-2">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1a6fc4] text-xl font-bold leading-none text-white">؟</span>
            <div className="min-w-0 flex-1 text-center">
              <AlertDialogPrimitive.Title className="text-base font-bold leading-6">{current.title ?? "تأكيد"}</AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{current.message}</AlertDialogPrimitive.Description>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Action
              onClick={() => { answerRef.current = true; }}
              className="rounded-sm bg-[#1a6fc4] px-8 py-1.5 text-sm font-semibold text-white hover:bg-[#155a9e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a6fc4]"
            >
              {current.confirmText ?? "نعم"}
            </AlertDialogPrimitive.Action>
            <AlertDialogPrimitive.Cancel className="rounded-sm border border-input bg-muted px-8 py-1.5 text-sm font-semibold text-foreground hover:bg-muted/70">
              {current.cancelText ?? "لا"}
            </AlertDialogPrimitive.Cancel>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
