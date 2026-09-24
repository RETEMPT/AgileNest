import { NotImplementedError } from "@/modules/core/errors";
import type { TaskDTO } from "@/modules/tasks";
import type { MilestoneDTO } from "@/modules/milestone";

export type CalendarCell = {
  iso: string;
  inMonth: boolean;
  tasks: TaskDTO[];
  milestones: MilestoneDTO[];
};

// —— Owner E（feature/calendar-notify）填实 ——

export async function monthView(
  actorId: string,
  projectId: string,
  year: number,
  month: number, // 1-12
): Promise<CalendarCell[]> {
  void actorId; void projectId; void year; void month;
  throw new NotImplementedError("monthView");
}
