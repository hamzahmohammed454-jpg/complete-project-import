import { describe, expect, it } from "vitest";

import { waBalanceText, waDetailText, waLastOpText, waLinkOrPicker, waSummaryText, whatsAppLink } from "@/lib/whatsapp";

describe("رابط واتساب", () => {
  it("يضيف مفتاح اليمن للرقم المحلي", () => {
    expect(whatsAppLink("777123456", "مرحبا")).toBe("https://wa.me/967777123456?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7");
  });

  it("يقبل الرقم الدولي كما هو ويزيل الرموز", () => {
    expect(whatsAppLink("+967 777 123 456", "x")).toBe("https://wa.me/967777123456?text=x");
  });

  it("يزيل 00 من البداية", () => {
    expect(whatsAppLink("00967777123456", "x")).toBe("https://wa.me/967777123456?text=x");
  });

  it("يرفض الأرقام الناقصة", () => {
    expect(whatsAppLink("12345", "x")).toBeNull();
    expect(whatsAppLink("", "x")).toBeNull();
  });

  it("يسقط إلى منتقي جهات الإرسال عند غياب رقم الطرف", () => {
    expect(waLinkOrPicker(null, "مرحبا")).toBe("https://wa.me/?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7");
    expect(waLinkOrPicker("777123456", "x")).toBe("https://wa.me/967777123456?text=x");
  });
});

describe("رسائل واتساب الجاهزة", () => {
  it("رسالة الرصيد تحمل اسم الطرف وجملة الرصيد والتاريخ", () => {
    const t = waBalanceText("أحمد", "الرصيد لكم ١٠٠ ريال", "2026-10-25");
    expect(t).toContain("أحمد");
    expect(t).toContain("الرصيد لكم ١٠٠ ريال");
    expect(t).toContain("2026-10-25");
  });

  it("الكشف الإجمالي يسرد كل عملة بمدينها ودائنها", () => {
    const t = waSummaryText("أحمد", "2026-10-25", [{ currency: "ريال", debit: 1000, credit: 400 }], "الصافي لكم");
    expect(t).toContain("كشف حساب إجمالي — أحمد");
    expect(t).toContain("ريال: مدين 1,000 / دائن 400");
    expect(t).toContain("الصافي لكم");
  });

  it("الكشف التفصيلي يقتطع إلى آخر ٦٠ حركة وينبّه على ذلك", () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
      date: "2026-10-01",
      description: `عملية ${i + 1}`,
      debit: i + 1,
      credit: 0,
      balance: i + 1,
    }));
    const t = waDetailText("أحمد", "", "2026-10-25", lines, "الرصيد عليكم");
    expect(t).toContain("آخر 60 حركة");
    expect(t).toContain("عملية 70");
    expect(t).not.toContain("عملية 1:");
  });

  it("رسالة آخر عملية تتعامل مع غياب العمليات", () => {
    expect(waLastOpText("أحمد", null)).toContain("لا توجد عمليات");
    const t = waLastOpText("أحمد", { date: "2026-10-24", description: "سند قبض 5", debit: 0, credit: 250, balance: -250 });
    expect(t).toContain("سند قبض 5");
    expect(t).toContain("دائن 250");
  });
});
