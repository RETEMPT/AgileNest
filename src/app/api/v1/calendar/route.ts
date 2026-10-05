import { NextResponse } from "next/server";
import {
  listAgenda,
  monthView,
  parseCalendarFilters,
  type CalendarCell,
} from "@/modules/calendar";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

/** 月网格按任务 / 里程碑拆开，方便外部视图直接渲染。 */
function shapeCells(cells: CalendarCell[]) {
  return cells.map((cell) => ({
    iso: cell.iso,
    inMonth: cell.inMonth,
    isWeekend: cell.isWeekend,
    tasks: cell.events.filter((event) => event.kind === "task"),
    milestones: cell.events.filter((event) => event.kind === "milestone"),
  }));
}

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    const view = url.searchParams.get("view");
    if (!projectId) throw new AppError("缺少 projectId");
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new AppError("缺少 year/month");
    }

    const cells = await monthView(user.id, projectId, year, month);
    if (view === "agenda") {
      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const days = await listAgenda(user.id, projectId, {
        from,
        to,
        filters: parseCalendarFilters(url.searchParams),
      });
      return NextResponse.json({ cells: shapeCells(cells), days });
    }
    return NextResponse.json({ cells: shapeCells(cells) });
  } catch (e) {
    return jsonError(e);
  }
}
