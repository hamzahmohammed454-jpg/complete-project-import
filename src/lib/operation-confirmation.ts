import { confirmAsk } from "@/components/confirm-dialog";

/** Cancel before invoking the operation: no write, queued action or success state. */
export function confirmOperation(action: string, run: () => unknown): void {
  void confirmAsk("لن تُنفّذ العملية إلا بعد الموافقة. هل تريد المتابعة؟", { title: `تأكيد ${action}` }).then((ok) => {
    if (ok) run();
  });
}
