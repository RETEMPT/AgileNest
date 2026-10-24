import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/modules/core";
import { jsonError, requireApiUser } from "@/lib/api";
import { listResourceFavorites, setResourceFavorite } from "./favorites-service";
const headers = { "Cache-Control": "private, no-store" };
export async function resourceFavoritesGET() {
  try { const user = await requireApiUser(); return NextResponse.json({ resources: await listResourceFavorites(user.id) }, { headers }); }
  catch (error) { return jsonError(error); }
}
export async function resourceFavoritesPUT(request: Request) {
  try {
    const user = await requireApiUser();
    const text = await request.text();
    if (text.length > 256) throw new AppError("收藏请求过大");
    let raw: unknown; try { raw = JSON.parse(text) as unknown; } catch { throw new AppError("收藏请求格式无效"); }
    const input = z.object({ resourceId: z.uuid(), favorite: z.boolean() }).strict().parse(raw);
    return NextResponse.json(await setResourceFavorite(user.id, input.resourceId, input.favorite), { headers });
  } catch (error) { return jsonError(error); }
}
