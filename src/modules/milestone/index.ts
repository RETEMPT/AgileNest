import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { milestones, type MilestoneKind, type MilestoneStatus } from "@/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/modules/core/errors";
import { requireProjectForUser, requireTeamRole } from "@/modules/core/permissions";

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

function toDTO(row: typeof milestones.$inferSelect): MilestoneDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    kind: row.kind,
    targetDate: row.targetDate,
    status: row.status,
    createdAt: row.createdAt,
  };
}

async function loadMilestone(milestoneId: string) {
  const [row] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId));
  if (!row) throw new NotFoundError("里程碑不存在");
  return row;
}

export async function listMilestones(
  actorId: string,
  projectId: string,
): Promise<MilestoneDTO[]> {
  await requireProjectForUser(actorId, projectId);
  const rows = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.targetDate), asc(milestones.createdAt));
  return rows.map(toDTO);
}

export async function createMilestone(
  actorId: string,
  projectId: string,
  input: {
    title: string;
    description?: string;
    kind?: MilestoneKind;
    targetDate?: string;
    requestKey?: string;
  },
): Promise<MilestoneDTO> {
  const access = await requireProjectForUser(actorId, projectId);
  if (access.role === "student") {
    await requireTeamRole(actorId, access.project.teamId, ["admin", "teacher"]);
  }
  const title = input.title?.trim();
  if (!title) throw new AppError("标题不能为空");
  if (title.length > 200) throw new AppError("标题最多 200 字");
  if (input.requestKey && !z.uuid().safeParse(input.requestKey).success) throw new AppError("创建请求无效，请重新打开表单");
  if ((input.description?.length ?? 0) > 10000) throw new AppError("说明最多 10000 字");
  if (input.kind && !z.enum(["open_topic", "midterm", "final", "defense", "custom"]).safeParse(input.kind).success) throw new AppError("里程碑类型无效");
  if (input.targetDate && !z.iso.date().safeParse(input.targetDate).success) {
    throw new AppError("日期需为 YYYY-MM-DD");
  }
  const row = await db.transaction(async (tx) => {
    if (input.requestKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'milestone:create:' + input.requestKey}))`);
      const [existing] = await tx.select().from(milestones).where(eq(milestones.id, input.requestKey));
      if (existing) {
        if (existing.projectId !== projectId || existing.title !== title || existing.description !== (input.description ?? null) || existing.kind !== (input.kind ?? "custom") || existing.targetDate !== (input.targetDate ?? null)) throw new ConflictError("此创建请求已使用，请重新打开表单");
        return existing;
      }
    }
    const [created] = await tx
      .insert(milestones)
      .values({
        ...(input.requestKey ? { id: input.requestKey } : {}),
        projectId,
        title,
        description: input.description ?? null,
        kind: input.kind ?? "custom",
        targetDate: input.targetDate ?? null,
      })
      .returning();
    return created;
  });
  return toDTO(row);
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
  const row = await loadMilestone(milestoneId);
  const access = await requireProjectForUser(actorId, row.projectId);
  if (access.role === "student") {
    await requireTeamRole(actorId, access.project.teamId, ["admin", "teacher"]);
  }
  if (patch.targetDate && !z.iso.date().safeParse(patch.targetDate).success) {
    throw new AppError("日期需为 YYYY-MM-DD");
  }
  const [updated] = await db
    .update(milestones)
    .set({
      ...(patch.title !== undefined && { title: patch.title.trim() }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.targetDate !== undefined && { targetDate: patch.targetDate }),
      ...(patch.status !== undefined && { status: patch.status }),
    })
    .where(eq(milestones.id, milestoneId))
    .returning();
  return toDTO(updated);
}

export async function deleteMilestone(
  actorId: string,
  milestoneId: string,
): Promise<void> {
  const row = await loadMilestone(milestoneId);
  const access = await requireProjectForUser(actorId, row.projectId);
  if (access.role === "student") {
    await requireTeamRole(actorId, access.project.teamId, ["admin", "teacher"]);
  }
  await db.delete(milestones).where(eq(milestones.id, milestoneId));
}
