import { NotImplementedError } from "@/modules/core/errors";
import type { MilestoneKind, MilestoneStatus } from "@/db/schema";

export type MilestoneDTO = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  kind: MilestoneKind;
  targetDate: string | null;
  status: MilestoneStatus;
  createdAt: Date;
};

// —— Owner E（feature/calendar-notify）填实 ——

export async function listMilestones(
  _actorId: string,
  _projectId: string,
): Promise<MilestoneDTO[]> {
  throw new NotImplementedError("listMilestones");
}

export async function createMilestone(
  _actorId: string,
  _projectId: string,
  _input: {
    title: string;
    description?: string;
    kind?: MilestoneKind;
    targetDate?: string;
  },
): Promise<MilestoneDTO> {
  throw new NotImplementedError("createMilestone");
}

export async function updateMilestone(
  _actorId: string,
  _milestoneId: string,
  _patch: {
    title?: string;
    description?: string | null;
    kind?: MilestoneKind;
    targetDate?: string | null;
    status?: MilestoneStatus;
  },
): Promise<MilestoneDTO> {
  throw new NotImplementedError("updateMilestone");
}

export async function deleteMilestone(
  _actorId: string,
  _milestoneId: string,
): Promise<void> {
  throw new NotImplementedError("deleteMilestone");
}
