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
  _actorId: string,
  _projectId: string,
  _year: number,
  /** 1-12 */
  _month: number,
): Promise<CalendarCell[]> {
  throw new NotImplementedError("monthView");
}
