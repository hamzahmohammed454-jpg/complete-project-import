import { describe, expect, it } from "vitest";
import { chooserMatch, filterPayByDate, isPayable, payRowSearchText } from "@/lib/transfer-pay";

describe("صرف الحوالات — القواعد", () => {
  it("الحوالة المعلقة للصرف: غير مسلّمة وغير ملغاة فقط", () => {
    expect(isPayable({ delivered: false, canceled: false })).toBe(true);
    expect(isPayable({ delivered: true, canceled: false })).toBe(false);
    expect(isPayable({ delivered: false, canceled: true })).toBe(false);
  });

  it("بحث اختيار الحوالة بالوضع الافتراضي «البحث يحتوي»", () => {
    expect(chooserMatch("خليف", "عبدالله خليف حسن", "البحث يحتوي")).toBe(true);
    expect(chooserMatch("خليف", "عبدالله حسن", "البحث يحتوي")).toBe(false);
  });

  it("بحث اختيار الحوالة بوضع «البحث يبدأ بـ» يطابق البداية فقط", () => {
    expect(chooserMatch("عبدالله", "عبدالله خليف", "البحث يبدأ بـ")).toBe(true);
    expect(chooserMatch("خليف", "عبدالله خليف", "البحث يبدأ بـ")).toBe(false);
  });

  it("نص البحث في اختيار الحوالة يجمع رقم السند ورقم الحوالة والاسمين", () => {
    const text = payRowSearchText({
      document_number: 12098,
      transfer_number: 7775554447,
      reference_number: null,
      receiver_name: "فاطمة فضل حسين عبد",
      sender_name: "نجاة أحمد",
    });
    expect(text).toContain("12098");
    expect(text).toContain("7775554447");
    expect(text).toContain("فاطمة");
    expect(text).toContain("نجاة");
  });

  it("القائمة المصروفة تحت النموذج تُحصر بالتاريخ المحدد (من — إلى)", () => {
    const rows = [
      { id: 1, the_date: "2026-10-29" },
      { id: 2, the_date: "2026-10-30" },
      { id: 3, the_date: "2026-10-31" },
    ];
    expect(filterPayByDate(rows, "2026-10-30", "2026-10-30").map((r) => r.id)).toEqual([2]);
    expect(filterPayByDate(rows, "", "").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(filterPayByDate(rows, "2026-10-30", "").map((r) => r.id)).toEqual([2, 3]);
  });
});
