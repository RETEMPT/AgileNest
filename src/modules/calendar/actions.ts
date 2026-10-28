"use server";

import { revalidatePath } from "next/cache";
import { requireUser, toFormError } from "@/modules/core";
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "./schedule-service";
import type { ScheduleDTO } from "./client";

export type ScheduleFormState = {
  error: string;
  saved?: ScheduleDTO;
  deleted?: boolean;
} | null;

export async function saveScheduleAction(
  _previous: ScheduleFormState,
  data: FormData,
): Promise<ScheduleFormState> {
  const user = await requireUser();
  try {
    const input = {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      scheduleDate: String(data.get("scheduleDate") ?? ""),
      startTime:
        data.get("allDay") === "on"
          ? null
          : String(data.get("startTime") ?? ""),
      endTime:
        data.get("allDay") === "on" ? null : String(data.get("endTime") ?? ""),
      priority: Number(data.get("priority")) as 0 | 1 | 2,
    };
    const scheduleId = String(data.get("scheduleId") ?? "");
    const saved = scheduleId
      ? await updateSchedule(
          user.id,
          scheduleId,
          Number(data.get("version")),
          input,
        )
      : await createSchedule(user.id, input);
    revalidatePath("/calendar");
    return { error: "", saved };
  } catch (error) {
    return { error: toFormError(error, "保存日程失败") };
  }
}

export async function deleteScheduleAction(
  _previous: ScheduleFormState,
  data: FormData,
): Promise<ScheduleFormState> {
  const user = await requireUser();
  try {
    await deleteSchedule(
      user.id,
      String(data.get("scheduleId") ?? ""),
      Number(data.get("version")),
    );
    revalidatePath("/calendar");
    return { error: "", deleted: true };
  } catch (error) {
    return { error: toFormError(error, "删除日程失败") };
  }
}
