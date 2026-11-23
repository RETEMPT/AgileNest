import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicFiles, users } from "@/db/schema";
import { AppError, NotFoundError, ForbiddenError } from "@/modules/core";
import { PUBLIC_FILE_MAX_BYTES, type PublicFileDTO } from "./client";

const MIMES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

function validateFile(file: { name: string; bytes: Uint8Array }): { mime: string; base64: string; size: number } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIMES[ext];
  if (!mime || /[\u0000-\u001f/\\]/.test(file.name) || file.name.length > 200) {
    throw new AppError("不支持此文件名或格式，请使用 PDF、图片、文本、Office 或 ZIP");
  }
  if (!file.bytes.length || file.bytes.length > PUBLIC_FILE_MAX_BYTES) {
    throw new AppError("文件需大于 0 字节且不超过 10 MB");
  }
  const buffer = Buffer.from(file.bytes);
  if (ext === "pdf" && buffer.subarray(0, 5).toString() !== "%PDF-") throw new AppError("PDF 文件内容无效");
  if (ext === "png" && buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new AppError("PNG 图片内容无效");
  if (["jpg", "jpeg"].includes(ext) && buffer.subarray(0, 3).toString("hex") !== "ffd8ff") throw new AppError("JPEG 图片内容无效");
  if (ext === "gif" && !["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString())) throw new AppError("GIF 图片内容无效");
  if (ext === "webp" && (buffer.subarray(0, 4).toString() !== "RIFF" || buffer.subarray(8, 12).toString() !== "WEBP")) throw new AppError("WebP 图片内容无效");
  if (["docx", "xlsx", "pptx", "zip"].includes(ext) && buffer.subarray(0, 2).toString() !== "PK") throw new AppError("压缩文档内容无效");
  return { mime, base64: buffer.toString("base64"), size: buffer.length };
}

function toDTO(row: typeof publicFiles.$inferSelect, uploaderName: string | null, actorId: string): PublicFileDTO {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    uploaderName,
    createdAt: row.createdAt.toISOString(),
    canDelete: row.uploadedById === actorId,
  };
}

export async function listPublicFiles(actorId: string): Promise<PublicFileDTO[]> {
  const rows = await db
    .select({ file: publicFiles, uploaderName: users.name })
    .from(publicFiles)
    .leftJoin(users, eq(users.id, publicFiles.uploadedById))
    .orderBy(desc(publicFiles.createdAt), desc(publicFiles.id));
  return rows.map(({ file, uploaderName }) => toDTO(file, uploaderName, actorId));
}

export async function uploadPublicFile(
  actorId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<PublicFileDTO> {
  const validated = validateFile(file);
  const [created] = await db
    .insert(publicFiles)
    .values({ fileName: file.name, mimeType: validated.mime, size: validated.size, contentBase64: validated.base64, uploadedById: actorId })
    .returning();
  return toDTO(created, null, actorId);
}

export async function getPublicFile(actorId: string, fileId: string): Promise<{ file: PublicFileDTO; bytes: Buffer }> {
  const [row] = await db
    .select({ file: publicFiles, uploaderName: users.name })
    .from(publicFiles)
    .leftJoin(users, eq(users.id, publicFiles.uploadedById))
    .where(eq(publicFiles.id, fileId));
  if (!row) throw new NotFoundError("文件不存在");
  return { file: toDTO(row.file, row.uploaderName, actorId), bytes: Buffer.from(row.file.contentBase64, "base64") };
}

export async function deletePublicFile(actorId: string, fileId: string): Promise<void> {
  const [row] = await db.select().from(publicFiles).where(eq(publicFiles.id, fileId));
  if (!row) throw new NotFoundError("文件不存在");
  if (row.uploadedById !== actorId) throw new ForbiddenError("只有上传者可以删除该文件");
  await db.delete(publicFiles).where(eq(publicFiles.id, fileId));
}
