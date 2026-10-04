"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, toFormError } from "@/modules/core";
import { saveAccountProfile } from "./profile-service";
import {
  createProject,
  createTeam,
  joinTeam,
  updateMemberRole,
  saveAcademicProfile,
  updateMemberPositions,
  confirmAcademicIdentity,
  updateProject,
} from "./service";
import {
  academicProfileSchema,
  positionsSchema,
  projectInputSchema,
  projectUpdateSchema,
  teamNameSchema,
} from "./schema";

export type IdentityFormState = { error: string; ok?: string } | null;

export async function saveAccountProfileAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  try {
    await saveAccountProfile(user.id, {
      name: String(data.get("name") ?? ""),
      bio: String(data.get("bio") ?? ""),
      avatar: String(data.get("avatar") ?? "") || undefined,
    });
  } catch (error) {
    return { error: toFormError(error) };
  }
  revalidatePath("/", "layout");
  return { error: "", ok: "个人资料已保存" };
}

export async function updateProjectAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const projectId = z.uuid().safeParse(data.get("projectId"));
  const parsed = projectUpdateSchema.safeParse({
    name: data.get("name"),
    description: data.get("description"),
    startDate: data.get("startDate") || null,
    endDate: data.get("endDate") || null,
    status: data.get("status"),
  });
  if (!projectId.success || !parsed.success)
    return {
      error: !parsed.success ? parsed.error.issues[0].message : "项目无效",
    };
  try {
    await updateProject(user.id, projectId.data, parsed.data);
  } catch (error) {
    return { error: toFormError(error, "保存项目失败") };
  }
  revalidatePath(`/p/${projectId.data}`, "layout");
  revalidatePath("/t", "layout");
  revalidatePath("/home", "layout");
  return { error: "", ok: "项目设置已保存" };
}

export async function saveAcademicProfileAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = academicProfileSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await saveAcademicProfile(user.id, parsed.data);
  } catch (error) {
    return { error: toFormError(error, "保存身份信息失败") };
  }
  revalidatePath("/settings");
  revalidatePath("/t", "layout");
  return { error: "", ok: "身份信息已保存，请联系所在团队管理员确认" };
}

export async function updatePositionsAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z
    .object({ teamId: z.uuid(), userId: z.uuid(), positions: positionsSchema })
    .safeParse({
      teamId: data.get("teamId"),
      userId: data.get("userId"),
      positions: data.getAll("positions"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateMemberPositions(
      user.id,
      parsed.data.teamId,
      parsed.data.userId,
      parsed.data.positions,
    );
  } catch (error) {
    return { error: toFormError(error, "保存职务失败") };
  }
  revalidatePath("/t", "layout");
  revalidatePath("/p", "layout");
  revalidatePath("/home", "layout");
  return { error: "", ok: "团队职务已更新" };
}

export async function confirmAcademicIdentityAction(
  _prev: IdentityFormState,
  data: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      teamId: z.uuid(),
      userId: z.uuid(),
      version: z.coerce.number().int().positive(),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "成员或资料版本无效，请刷新重试" };
  try {
    await confirmAcademicIdentity(
      user.id,
      parsed.data.teamId,
      parsed.data.userId,
      parsed.data.version,
    );
  } catch (error) {
    return { error: toFormError(error, "确认身份失败") };
  }
  revalidatePath(`/t/${parsed.data.teamId}/members`);
  return { error: "", ok: "已确认该成员当前的身份资料" };
}

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
