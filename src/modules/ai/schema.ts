import { z } from "zod";
import { modelConfigurationSchema } from "./client";

export const savedModelSchema = z.object({
  actorId: z.string().min(1), expiresAt: z.number().int().positive(),
  configuration: modelConfigurationSchema, apiKey: z.string().min(1).max(1024),
}).strict();
export type SavedModel = z.infer<typeof savedModelSchema>;
