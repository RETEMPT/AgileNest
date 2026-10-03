import { and, eq, getTableColumns, inArray } from "drizzle-orm";
import { db } from "@/db";
import { milestones, tasks, users } from "@/db/schema";
import { AppError } from "@/modules/core/errors";
import { monthGrid } from "@/modules/core/dates";
import { requireProjectForUser } from "@/modules/core/permissions";
import { toDTO, type TaskDTO, type TaskRow } from "@/modules/tasks";
import type { MilestoneDTO } from "@/modules/milestone";

export type CalendarCell = {
  iso: string;
  inMonth: boolean;
  tasks: TaskDTO[];
  milestones: MilestoneDTO[];
};

export async function monthView(
  actorId: string,
  projectId: string,
  year: number,
  /** 1-12 */
  month: number,
): Promise<CalendarCell[]> {
  await requireProjectForUser(actorId, projectId);
  if (month < 1 || month > 12) throw new AppError("月份需在 1–12");

  const cells = monthGrid(year, month);
  const isos = cells.map((c) => c.iso);

  const taskRows: TaskRow[] = await db
    .select({ ...getTableColumns(tasks), assigneeName: users.name })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.projectId, projectId), inArray(tasks.dueDate, isos)));

  const msRows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), inArray(milestones.targetDate, isos)));

  const tasksByDay = new Map<string, TaskDTO[]>();
  for (const t of taskRows) {
    if (!t.dueDate) continue;
    const list = tasksByDay.get(t.dueDate) ?? [];
    list.push(toDTO(t));
    tasksByDay.set(t.dueDate, list);
  }

  const msByDay = new Map<string, MilestoneDTO[]>();
  for (const m of msRows) {
    if (!m.targetDate) continue;
    const dto: MilestoneDTO = {
      id: m.id,
      projectId: m.projectId,
      title: m.title,
      description: m.description,
      kind: m.kind,
      targetDate: m.targetDate,
      status: m.status,
      createdAt: m.createdAt,
    };
    const list = msByDay.get(m.targetDate) ?? [];
    list.push(dto);
    msByDay.set(m.targetDate, list);
  }

  return cells.map((c) => ({
    iso: c.iso,
    inMonth: c.inMonth,
    tasks: tasksByDay.get(c.iso) ?? [],
    milestones: msByDay.get(c.iso) ?? [],
  }));
}
