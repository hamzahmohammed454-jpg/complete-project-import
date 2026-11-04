import { describe, expect, it } from "vitest";

import { fmt, fmtDateTime, fmtMoney, fmtSigned } from "@/lib/money";

describe("تنسيق الأرقام الموحّد", () => {
  it("يفصل الآلاف بفاصلة ويُبقي الكسور عند الحاجة", () => {
    expect(fmt(25000)).toBe("25,000");
    expect(fmt(140.5)).toBe("140.5");
    expect(fmt(140)).toBe("140");
  });

  it("يُظهر الصفر رقمًا لا نقطة فارغة", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(null)).toBe("0");
    expect(fmt(undefined)).toBe("0");
    expect(fmt("")).toBe("0");
    expect(fmt("abc")).toBe("0");
  });

  it("يقرّب إلى رقمين عشريين", () => {
    expect(fmt(1234.567)).toBe("1,234.57");
  });

  it("يضيف اسم العملة", () => {
    expect(fmtMoney(1500, "ريال يمني")).toBe("1,500 ريال يمني");
    expect(fmtMoney(1500)).toBe("1,500");
  });

  it("يوجّه المبلغ بعلامة موجبة أو سالبة", () => {
    expect(fmtSigned(25000)).toBe("+25,000");
    expect(fmtSigned(-25000)).toBe("−25,000");
    expect(fmtSigned(0)).toBe("0");
  });

  it("يوحّد وقت السجل", () => {
    expect(fmtDateTime("2026-10-24T19:39:54Z")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(fmtDateTime(null)).toBe("—");
  });
});
