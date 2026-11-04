import { describe, expect, it } from "vitest";
import { checksInWindow, transfersOlderThan } from "@/lib/management-reports";
describe("management alerts", () => {
  it("includes overdue checks and the selected due window only", () => {
    expect(checksInWindow([{ days: 4 }, { days: -2 }, { days: 3 }], 3)).toEqual([{ days: -2 }, { days: 3 }]);
  });
  it("shows transfers at or older than the selected age", () => {
    expect(transfersOlderThan([{ days: 0 }, { days: 10 }, { days: 5 }], 5)).toEqual([{ days: 10 }, { days: 5 }]);
  });
});