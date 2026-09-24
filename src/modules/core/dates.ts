/** 日期一律以 `YYYY-MM-DD` 字符串落库（pg date），与 UI 一致。 */

export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidISODate(s: string | null | undefined): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 逾期（不含当天） */
export function isOverdue(dueISO: string | null | undefined, today = todayISO()): boolean {
  return !!dueISO && dueISO < today;
}

/** 今日起 N 天内到期 */
export function isDueSoon(
  dueISO: string | null | undefined,
  withinDays = 3,
  today = todayISO(),
): boolean {
  if (!dueISO) return false;
  return dueISO >= today && daysBetween(today, dueISO) <= withinDays;
}

/** 分钟 → 可读工时，如 90 → "1h 30m" */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 年月 → 当月网格（含前后补齐），每格 { iso, inMonth } */
export function monthGrid(year: number, month: number): { iso: string; inMonth: boolean }[] {
  // month: 1-12
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() + 6) % 7; // 周一为一周起点
  const start = new Date(first);
  start.setDate(1 - startPad);

  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ iso: todayISO(d), inMonth: d.getMonth() === month - 1 });
  }
  return cells;
}
