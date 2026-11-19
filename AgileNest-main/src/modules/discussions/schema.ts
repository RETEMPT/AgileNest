import { z } from "zod";
import { discussionEditSchema, discussionResolveSchema } from "./client";

export const discussionPatchSchema = z.discriminatedUnion("op", [
  discussionEditSchema.extend({ op: z.literal("edit") }),
  z.object({ op: z.literal("withdraw"), version: z.number().int().positive() }),
  discussionResolveSchema.extend({ op: z.literal("resolve") }),
]);
