import { and, asc, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { personalSchedules, users } from "@/db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/modules/core";
import {
  calendarMonthSchema,
  scheduleIdSchema,
  scheduleInputSchema,
  scheduleVersionSchema,
} from "./schema";
import type { ScheduleDTO, ScheduleInput } from "./client";

async function requireAccount(actorId: string) {
  if (!scheduleIdSchema.safeParse(actorId).success)
    throw new ForbiddenError("请先登录后管理日程");
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  if (!account) throw new ForbiddenError("账号不可用，请重新登录");
}

function parseInput(input: ScheduleInput) {
  const parsed = scheduleInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return parsed.data;
}

function toSchedule(row: typeof personalSchedules.$inferSelect): ScheduleDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduleDate: row.scheduleDate,
    startTime: row.startTime,
    endTime: row.endTime,
    priority: row.priority,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMySchedules(
  actorId: string,
  year: number,
  month: number,
): Promise<ScheduleDTO[]> {
  await requireAccount(actorId);
  const parsed = calendarMonthSchema.safeParse({ year, month });
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
  const rows = await db
    .select()
    .from(personalSchedules)
    .where(
      and(
        eq(personalSchedules.userId, actorId),
        between(personalSchedules.scheduleDate, first, last),
      ),
    )
    .orderBy(
      asc(personalSchedules.scheduleDate),
      asc(personalSchedules.startTime),
      asc(personalSchedules.id),
    );
  return rows.map(toSchedule);
}

export async function createSchedule(
  actorId: string,
  input: ScheduleInput,
): Promise<ScheduleDTO> {
  await requireAccount(actorId);
  const data = parseInput(input);
  const [row] = await db
    .insert(personalSchedules)
    .values({ ...data, userId: actorId })
    .returning();
  return toSchedule(row);
}

function parseSelection(scheduleId: string, version: number) {
  if (!scheduleIdSchema.safeParse(scheduleId).success)
    throw new NotFoundError("日程不存在");
  if (!scheduleVersionSchema.safeParse(version).success)
    throw new AppError("日程版本无效，请刷新后重试");
}

async function mutationMiss(
  actorId: string,
  scheduleId: string,
): Promise<never> {
  const [owned] = await db
    .select({ id: personalSchedules.id })
    .from(personalSchedules)
    .where(
      and(
        eq(personalSchedules.id, scheduleId),
        eq(personalSchedules.userId, actorId),
      ),
    )
    .limit(1);
  if (!owned) throw new NotFoundError("日程不存在或已删除");
  throw new ConflictError("日程已被修改，请刷新后核对最新内容");
}

export async function updateSchedule(
  actorId: string,
  scheduleId: string,
  version: number,
  input: ScheduleInput,
): Promise<ScheduleDTO> {
  await requireAccount(actorId);
  parseSelection(scheduleId, version);
  const data = parseInput(input);
  const [row] = await db
    .update(personalSchedules)
    .set({
      ...data,
      version: sql`${personalSchedules.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(personalSchedules.id, scheduleId),
        eq(personalSchedules.userId, actorId),
        eq(personalSchedules.version, version),
      ),
    )
    .returning();
  if (!row) return mutationMiss(actorId, scheduleId);
  return toSchedule(row);
}

export async function deleteSchedule(
  actorId: string,
  scheduleId: string,
  version: number,
): Promise<void> {
  await requireAccount(actorId);
  parseSelection(scheduleId, version);
  const rows = await db
    .delete(personalSchedules)
    .where(
      and(
        eq(personalSchedules.id, scheduleId),
        eq(personalSchedules.userId, actorId),
        eq(personalSchedules.version, version),
      ),
    )
    .returning({ id: personalSchedules.id });
  if (!rows.length) await mutationMiss(actorId, scheduleId);
}
