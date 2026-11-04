import { describe, expect, it } from "vitest";

import { suggestRange } from "@/lib/period";

describe("اقتراح مدى فترة الإقفال", () => {
  const end = "2026-10-25";

  it("اليومي يوم واحد", () => {
    expect(suggestRange("يومي", end)).toEqual({ from: "2026-10-25", to: "2026-10-25" });
  });

  it("الأسبوعي آخر سبعة أيام", () => {
    expect(suggestRange("أسبوعي", end)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("الشهري من أول الشهر", () => {
    expect(suggestRange("شهري", end)).toEqual({ from: "2026-10-01", to: "2026-10-25" });
  });

  it("السنوي من أول السنة", () => {
    expect(suggestRange("سنوي", end)).toEqual({ from: "2026-01-01", to: "2026-10-25" });
  });
});
