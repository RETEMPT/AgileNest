import { z } from "zod";

export const assetRequestPatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("withdraw"), version: z.number().int().positive("申请版本无效") }),
  z.object({ op: z.literal("decide"), version: z.number().int().positive("申请版本无效"), decision: z.enum(["approve", "reject"]) }),
  z.object({ op: z.literal("return"), version: z.number().int().positive("申请版本无效") }),
]);
