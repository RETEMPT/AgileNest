import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jsonError, requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import {
  calendarMonthSchema,
  scheduleInputSchema,
  scheduleVersionSchema,
} from "./schema";
import {
  createSchedule,
  deleteSchedule,
  listMySchedules,
  updateSchedule,
} from "./schedule-service";
import { calendarBoard, parseCalendarFilters } from "./service";
import { monthBounds } from "./model";

type ScheduleContext = { params: Promise<{ scheduleId: string }> };
const monthQuerySchema = z
  .strictObject({ year: z.coerce.number(), month: z.coerce.number() })
  .pipe(calendarMonthSchema);
const updateSchema = z.strictObject({
  version: scheduleVersionSchema,
  input: scheduleInputSchema,
});
const deleteSchema = z.strictObject({ version: scheduleVersionSchema });
const headers = { "Cache-Control": "private, no-store" };

export async function projectCalendarGET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams;
    const projectId = z.uuid({ error: "请选择有效项目" }).parse(query.get("projectId"));
    const { year, month } = monthQuerySchema.parse({ year: query.get("year"), month: query.get("month") });
    const filters = parseCalendarFilters(query);
    const agenda = query.get("view") === "agenda";
    const bounds = monthBounds(year, month);
    const range = agenda ? { from: query.get("from") ?? bounds.from, to: query.get("to") ?? bounds.to } : undefined;
    const { cells, days } = await calendarBoard(user.id, projectId, { year, month, filters, range });
    if (agenda) {
      return NextResponse.json({ cells, days: days.flatMap((day) => day.items) }, { headers });
    }
    return NextResponse.json({ cells }, { headers });
  } catch (error) { return jsonError(error); }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("请求内容需为有效 JSON");
  }
}

export async function schedulesGET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = monthQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const schedules = await listMySchedules(user.id, query.year, query.month);
    return NextResponse.json({ schedules }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function schedulesPOST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = scheduleInputSchema.parse(await readBody(request));
    const schedule = await createSchedule(user.id, input);
    revalidatePath("/calendar");
    return NextResponse.json({ schedule }, { status: 201, headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function schedulePUT(request: Request, context: ScheduleContext) {
  try {
    const user = await requireApiUser();
    const { scheduleId } = await context.params;
    const { version, input } = updateSchema.parse(await readBody(request));
    const schedule = await updateSchedule(user.id, scheduleId, version, input);
    revalidatePath("/calendar");
    return NextResponse.json({ schedule }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function scheduleDELETE(
  request: Request,
  context: ScheduleContext,
) {
  try {
    const user = await requireApiUser();
    const { scheduleId } = await context.params;
    const { version } = deleteSchema.parse(await readBody(request));
    await deleteSchedule(user.id, scheduleId, version);
    revalidatePath("/calendar");
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    return jsonError(error);
  }
}
