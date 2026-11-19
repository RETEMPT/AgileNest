import { z } from "zod";
export { scheduleInputSchema, calendarMonthSchema } from "./client";
export const scheduleIdSchema = z.uuid({ error: "日程不存在" });
export const scheduleVersionSchema = z
  .number()
  .int()
  .positive({ error: "日程版本无效，请刷新后重试" });
