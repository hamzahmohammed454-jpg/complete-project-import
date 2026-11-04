import { describe, expect, it } from "vitest";
import { employeeRows, savedByDocument, savedRows, sessionRows, userSummaries, type LogRow } from "@/lib/user-monitor";

const row = (id: number, username: string, action: string, created_at: string, target: string | null = null): LogRow => ({ id, user_id: null, username, action, target, created_at });
const rows: LogRow[] = [
  row(1, "ali", "تسجيل دخول", "2026-10-28T08:00:00Z"),
  row(2, "ali", "فتح شاشة", "2026-10-28T08:01:00Z", "/transfers"),
  row(3, "ali", "إضافة", "2026-10-28T08:02:00Z", "outgoing_transfers"),
  row(4, "ali", "تعديل", "2026-10-28T09:00:00Z", "outgoing_transfers"),
  row(5, "sara", "إضافة", "2026-10-28T10:00:00Z", "buy_currencies"),
  row(6, "sara", "حذف", "2026-10-28T10:05:00Z", "buy_currencies"),
  row(7, "ali", "تسجيل خروج", "2026-10-28T11:00:00Z"),
];

describe("user monitoring reports", () => {
  it("المحفوظات are only add/edit/delete actions", () => {
    expect(savedRows(rows).map((r) => r.id)).toEqual([3, 4, 5, 6]);
  });
  it("groups saved records by document and action", () => {
    const g = savedByDocument(rows);
    expect(g.find((x) => x.target === "buy_currencies" && x.action === "حذف")?.count).toBe(1);
    expect(g.reduce((s, x) => s + x.count, 0)).toBe(4);
  });
  it("tracks last edit time and work counts per user", () => {
    const ali = userSummaries(rows).find((s) => s.user === "ali");
    expect(ali?.lastEdit).toBe("2026-10-28T09:00:00Z");
    expect(ali?.added).toBe(1);
    expect(ali?.sessions).toBe(1);
    expect(ali?.lastActivity).toBe("2026-10-28T11:00:00Z");
  });
  it("sessions list holds only sign-in and sign-out", () => {
    expect(sessionRows(rows).map((r) => r.id)).toEqual([1, 7]);
  });
  it("employee report shows only that employee", () => {
    expect(employeeRows(rows, "sara").map((r) => r.id)).toEqual([5, 6]);
  });
});
