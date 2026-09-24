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

// —— Owner E（feature-calendar-notify）填实 ——

export async function listMilestones(
  actorId: string,
  projectId: string,
): Promise<MilestoneDTO[]> {
  void actorId; void projectId;
  throw new NotImplementedError("listMilestones");
}

export async function createMilestone(
  actorId: string,
  projectId: string,
  input: {
    title: string;
    description?: string;
    kind?: MilestoneKind;
    targetDate?: string;
  },
): Promise<MilestoneDTO> {
  void actorId; void projectId; void input;
  throw new NotImplementedError("createMilestone");
}

export async function updateMilestone(
  actorId: string,
  milestoneId: string,
  patch: {
    title?: string;
    description?: string | null;
    kind?: MilestoneKind;
    targetDate?: string | null;
    status?: MilestoneStatus;
  },
): Promise<MilestoneDTO> {
  void actorId; void milestoneId; void patch;
  throw new NotImplementedError("updateMilestone");
}

export async function deleteMilestone(
  actorId: string,
  milestoneId: string,
): Promise<void> {
  void actorId; void milestoneId;
  throw new NotImplementedError("deleteMilestone");
}
