import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialogHost, confirmAsk } from "@/components/confirm-dialog";

afterEach(cleanup);

describe("confirmation dialog", () => {
  it("shows title and message, and resolves true on نعم", async () => {
    render(<ConfirmDialogHost />);
    const pending = confirmAsk("حذف البنك «الأهلي»؟", { title: "تأكيد الحذف" });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("تأكيد الحذف");
    expect(dialog.textContent).toContain("حذف البنك «الأهلي»؟");
    fireEvent.click(screen.getByRole("button", { name: "نعم" }));
    await expect(pending).resolves.toBe(true);
  });
  it("resolves false on لا", async () => {
    render(<ConfirmDialogHost />);
    const pending = confirmAsk("حذف هذا الدفتر؟");
    fireEvent.click(await screen.findByRole("button", { name: "لا" }));
    await expect(pending).resolves.toBe(false);
  });
  it("canceled dialog never confirms", async () => {
    render(<ConfirmDialogHost />);
    const pending = confirmAsk("تأكيد تنفيذ العملية؟");
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await expect(pending).resolves.toBe(false);
  });
  it("queues dialogs and resolves them in order", async () => {
    render(<ConfirmDialogHost />);
    const first = confirmAsk("الأول؟");
    const second = confirmAsk("الثاني؟");
    fireEvent.click(await screen.findByRole("button", { name: "نعم" }));
    await expect(first).resolves.toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "نعم" }));
    await expect(second).resolves.toBe(true);
  });
});
