"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, toFormError } from "@/modules/core";
import {
  createProject,
  createTeam,
  joinTeam,
  updateMemberRole,
} from "./service";
import { projectInputSchema, teamNameSchema } from "./schema";

export type IdentityFormState = { error: string; ok?: string } | null;

export async function createTeamAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = teamNameSchema.safeParse(data.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const scenario = z
    .enum(["course", "lab", "contest"])
    .safeParse(data.get("scenario"));
  if (!scenario.success) return { error: "请选择协作场景" };
  let teamId: string;
  try {
    teamId = (await createTeam(user.id, parsed.data)).id;
  } catch (error) {
    return { error: toFormError(error, "创建团队失败，请稍后重试") };
  }
  revalidatePath("/t");
  revalidatePath("/home");
  redirect(`/t/${teamId}/projects?kind=${scenario.data}`);
}

export async function joinTeamAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z
    .string()
    .trim()
    .min(1, "请填写邀请码")
    .max(30, "邀请码无效")
    .safeParse(data.get("inviteCode"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let teamId: string;
  try {
    teamId = (await joinTeam(user.id, parsed.data)).teamId;
  } catch (error) {
    return { error: toFormError(error, "加入团队失败，请稍后重试") };
  }
  revalidatePath("/t");
  revalidatePath("/home");
  redirect(`/t/${teamId}/projects`);
}

export async function createProjectAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = projectInputSchema
    .safeExtend({ teamId: z.uuid("团队无效") })
    .safeParse({
      ...Object.fromEntries(data),
      startDate: data.get("startDate") || undefined,
      endDate: data.get("endDate") || undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let projectId: string;
  try {
    projectId = (await createProject(user.id, parsed.data.teamId, parsed.data))
      .id;
  } catch (error) {
    return { error: toFormError(error, "创建项目失败，请稍后重试") };
  }
  revalidatePath("/t");
  revalidatePath(`/t/${parsed.data.teamId}/projects`);
  revalidatePath("/home", "layout");
  redirect(`/p/${projectId}/board`);
}

export async function updateRoleAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      teamId: z.uuid(),
      userId: z.uuid(),
      role: z.enum(["admin", "teacher", "student"]),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "请选择有效的成员和角色" };
  try {
    await updateMemberRole(
      user.id,
      parsed.data.teamId,
      parsed.data.userId,
      parsed.data.role,
    );
  } catch (error) {
    return { error: toFormError(error, "修改角色失败") };
  }
  revalidatePath(`/t/${parsed.data.teamId}`, "layout");
  revalidatePath("/home", "layout");
  return { error: "", ok: "角色已更新" };
}
