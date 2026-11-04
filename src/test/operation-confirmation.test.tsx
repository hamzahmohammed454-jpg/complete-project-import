import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { confirmOperation } from "@/lib/operation-confirmation";
import { FormCard } from "@/components/ui-kit";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("system operation confirmation", () => {
  it("does not execute a canceled operation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const write = vi.fn();
    confirmOperation("صرف الحوالة", write);
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
  });
  it("executes an approved operation exactly once", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn();
    confirmOperation("تحصيل الشيك", write);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  });
  it("blocks shared form writes when canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const write = vi.fn();
    render(<FormCard onSubmit={write}><button type="submit">حفظ</button></FormCard>);
    fireEvent.submit(screen.getByRole("button").closest("form") as HTMLFormElement);
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
  });
  it("submits a shared form only after approval", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn();
    render(<FormCard onSubmit={write}><button type="submit">حفظ</button></FormCard>);
    fireEvent.submit(screen.getByRole("button").closest("form") as HTMLFormElement);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  });
});
