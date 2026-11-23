import { z } from "zod";

export const PUBLIC_FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB，与资料库一致
export const PUBLIC_FILE_NAME_LIMIT = 200;

export const publicFileSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedById: z.uuid().nullable(),
  uploaderName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  canDelete: z.boolean(),
});
export const publicFileListSchema = z.object({ files: z.array(publicFileSchema) });

export type PublicFileDTO = z.infer<typeof publicFileSchema>;
export type PublicFileListDTO = z.infer<typeof publicFileListSchema>;
