import { z } from "zod";
import { projectCommentEditSchema, projectCommentWithdrawSchema } from "./client";

export const projectCommentPatchSchema = z.discriminatedUnion("op", [
  projectCommentEditSchema.extend({ op: z.literal("edit") }),
  projectCommentWithdrawSchema.extend({ op: z.literal("withdraw") }),
]);
