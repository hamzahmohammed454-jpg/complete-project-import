import { describe, expect, it } from "vitest";
import { applyWaPrefs } from "./whatsapp";

const msg = "السيد/ علي\nالرصيد لكم 100\nحتى يوم 2026-01-01";

describe("خيارات رسالة الواتساب", () => {
  it("إخفاء التاريخ يحذف سطر التاريخ", () => {
    expect(applyWaPrefs(msg, { waShowBalance: true, waShowDate: false, waShowShop: false })).toBe("السيد/ علي\nالرصيد لكم 100");
  });
  it("إخفاء الرصيد يحذف سطر الرصيد", () => {
    expect(applyWaPrefs(msg, { waShowBalance: false, waShowDate: true, waShowShop: false })).toBe("السيد/ علي\nحتى يوم 2026-01-01");
  });
  it("إظهار اسم المحل يضيفه آخر الرسالة", () => {
    expect(applyWaPrefs(msg, { waShowBalance: true, waShowDate: true, waShowShop: true }).endsWith("ابو طه للصرافة والتحويلات المالية")).toBe(true);
  });
});

describe("سطر أول وآخر الرسالة", () => {
  it("يضيف السطرين حول الرسالة", () => {
    const out = applyWaPrefs("نص", { waShowBalance: true, waShowDate: true, waShowShop: false, waHeader: "أهلاً", waFooter: "شكراً" });
    expect(out).toBe("أهلاً\nنص\nشكراً");
  });
});
