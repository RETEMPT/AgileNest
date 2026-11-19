import { describe, it, expect } from "vitest";
import {
  todayISO,
  isValidISODate,
  addDaysISO,
  daysBetween,
  isOverdue,
  isDueSoon,
  formatMinutes,
  monthGrid,
} from "@/modules/core/dates";

describe("dates", () => {
  it("todayISO 输出 YYYY-MM-DD", () => {
    expect(todayISO(new Date("2026-09-24T12:00:00"))).toBe("2026-09-24");
  });

  it("isValidISODate", () => {
    expect(isValidISODate("2026-09-24")).toBe(true);
    expect(isValidISODate("2026/09/24")).toBe(false);
    expect(isValidISODate(null)).toBe(false);
  });

  it("addDaysISO / daysBetween", () => {
    expect(addDaysISO("2026-09-24", 7)).toBe("2026-10-01");
    expect(daysBetween("2026-09-24", "2026-10-01")).toBe(7);
  });

  it("isOverdue 不含当天；isDueSoon 含 N 天内", () => {
    expect(isOverdue("2026-09-23", "2026-09-24")).toBe(true);
    expect(isOverdue("2026-09-24", "2026-09-24")).toBe(false);
    expect(isDueSoon("2026-09-26", 3, "2026-09-24")).toBe(true);
    expect(isDueSoon("2026-09-28", 3, "2026-09-24")).toBe(false);
    expect(isDueSoon(null, 3, "2026-09-24")).toBe(false);
  });

  it("formatMinutes", () => {
    expect(formatMinutes(30)).toBe("30m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(90)).toBe("1h 30m");
  });

  it("monthGrid 42 格、周一为起点", () => {
    const cells = monthGrid(2026, 9);
    expect(cells).toHaveLength(42);
    expect(cells[0].iso).toBe("2026-08-31"); // 2026-09-01 是周二，前补周一
    expect(cells[0].inMonth).toBe(false);
    expect(cells.some((c) => c.iso === "2026-09-01" && c.inMonth)).toBe(true);
  });
});
