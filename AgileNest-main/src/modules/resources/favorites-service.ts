import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { getResource } from "./service";
import type { ResourceDTO } from "./client";

const storedSchema = z.array(z.uuid()).max(1000);
function filename(actorId: string) {
  if (!actorId) throw new ForbiddenError();
  return path.join(process.env.RESOURCE_FAVORITES_DIR || path.join(process.cwd(), ".data", "resource-favorites"), `${createHash("sha256").update(actorId).digest("hex")}.json`);
}
async function read(actorId: string): Promise<string[]> {
  const target = filename(actorId);
  try { return storedSchema.parse(JSON.parse(await readFile(/* turbopackIgnore: true */ target, "utf8")) as unknown); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new AppError("收藏读取失败，请稍后重试", 503); }
}
type Favorite = Pick<ResourceDTO, "id" | "title" | "teamId" | "projectId" | "tags">;
export async function listResourceFavorites(actorId: string): Promise<Favorite[]> {
  const rows: Favorite[] = [];
  const ids = await read(actorId);
  for (let offset = 0; offset < ids.length; offset += 8) {
    const batch = await Promise.all(ids.slice(offset, offset + 8).map(async (id) => {
      try { const { id: resourceId, title, teamId, projectId, tags } = await getResource(actorId, id); return { id: resourceId, title, teamId, projectId, tags }; }
      catch (error) { if (!(error instanceof ForbiddenError || error instanceof NotFoundError)) throw error; return null; }
    }));
    for (const row of batch) if (row) rows.push(row);
  }
  return rows;
}
export async function setResourceFavorite(actorId: string, resourceId: string, favorite: boolean) {
  if (!z.uuid().safeParse(resourceId).success || !z.boolean().safeParse(favorite).success) throw new AppError("收藏参数无效");
  if (favorite) await getResource(actorId, resourceId);
  const target = filename(actorId);
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try { await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); }
  catch { throw new AppError("收藏存储不可写，请稍后重试", 503); }
  for (let attempt = 0; attempt < 40; attempt++) {
    try { lock = await open(`${target}.lock`, "wx", 0o600); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new AppError("收藏存储不可写", 503); await delay(50); }
  }
  if (!lock) throw new ConflictError("收藏正在保存，请稍后重试");
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const ids = await read(actorId);
    const next = favorite ? [resourceId, ...ids.filter((id) => id !== resourceId)] : ids.filter((id) => id !== resourceId);
    if (next.length > 1000) throw new AppError("收藏已达 1000 条，请先取消部分收藏");
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, target);
    return { resourceId, favorite };
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError("收藏保存失败，请重试", 503); }
  finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(`${target}.lock`).catch(() => {}); }
}
