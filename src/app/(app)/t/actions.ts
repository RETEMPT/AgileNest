"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/core/session";
import { AppError } from "@/modules/core/errors";
import { createTeam, joinTeam } from "@/modules/identity";

export type FormState = { error: string } | null;

const createSchema = z.object({ name: z.string().min(1, "请填写团队名称") });
const joinSchema = z.object({ inviteCode: z.string().min(1, "请填写邀请码") });

function handleActionError(e: unknown, fallback: string): FormState {
  if (e instanceof AppError) return { error: e.message };
  console.error("[team action]", e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("5432")) {
    return { error: "数据库连接失败，请确认数据库服务已启动。" };
  }
  return { error: fallback };
}

export async function createTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createTeam(user.id, parsed.data.name);
  } catch (e) {
    return handleActionError(e, "创建团队失败，请稍后重试。");
  }
  revalidatePath("/t");
  return null;
}

export async function joinTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = joinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await joinTeam(user.id, parsed.data.inviteCode.trim());
  } catch (e) {
    return handleActionError(e, "加入团队失败，请稍后重试。");
  }
  revalidatePath("/t");
  return null;
}
