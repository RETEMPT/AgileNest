"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, toFormError } from "@/modules/core";
import {
  createTeamAnnouncement, deleteTeamAnnouncement, getTeamInformation, leaveTeam, removeTeamMember,
  rotateTeamInvite, updateTeamAnnouncement, updateTeamInformation,
} from "./team-service";
import type { TeamInformationDTO } from "./team-client";
import type { IdentityFormState } from "./actions";

export type TeamSettingsFormState = {
  error: string; ok?: string; saved?: TeamInformationDTO;
} | null;

const teamIdSchema = z.uuid({ error: "团队无效" });
const announcementIdSchema = z.uuid({ error: "公告无效" });

function refreshTeam(teamId: string) {
  revalidatePath(`/t/${teamId}`, "layout");
  revalidatePath("/", "layout");
}

export async function reloadTeamInformationAction(teamId: string): Promise<TeamSettingsFormState> {
  const user = await requireUser();
  const parsed = teamIdSchema.safeParse(teamId);
  if (!parsed.success) return { error: "团队无效" };
  try {
    return { error: "", saved: await getTeamInformation(user.id, parsed.data) };
  } catch (error) {
    return { error: toFormError(error, "读取团队资料失败") };
  }
}

export async function saveTeamInformationAction(_prev: TeamSettingsFormState, data: FormData): Promise<TeamSettingsFormState> {
  const user = await requireUser();
  const teamId = teamIdSchema.safeParse(data.get("teamId"));
  if (!teamId.success) return { error: "团队无效" };
  try {
    const saved = await updateTeamInformation(user.id, teamId.data, {
      version: Number(data.get("version")), name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""), website: String(data.get("website") ?? ""),
      contactEmail: String(data.get("contactEmail") ?? ""),
    });
    refreshTeam(teamId.data);
    return { error: "", ok: "团队资料已保存", saved };
  } catch (error) {
    return { error: toFormError(error, "保存团队资料失败") };
  }
}

export async function rotateTeamInviteAction(_prev: TeamSettingsFormState, data: FormData): Promise<TeamSettingsFormState> {
  const user = await requireUser();
  const teamId = teamIdSchema.safeParse(data.get("teamId"));
  if (!teamId.success) return { error: "团队无效" };
  try {
    const saved = await rotateTeamInvite(user.id, teamId.data, {
      version: Number(data.get("version")), inviteExpiresOn: String(data.get("inviteExpiresOn") ?? "") || null,
    });
    refreshTeam(teamId.data);
    return { error: "", ok: "邀请码已刷新，旧码立即失效", saved };
  } catch (error) {
    return { error: toFormError(error, "刷新邀请码失败") };
  }
}

export async function saveTeamAnnouncementAction(_prev: IdentityFormState, data: FormData): Promise<IdentityFormState> {
  const user = await requireUser();
  const teamId = teamIdSchema.safeParse(data.get("teamId"));
  if (!teamId.success) return { error: "团队无效" };
  const announcementId = data.get("announcementId");
  const fields = {
    title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), pinned: data.get("pinned") === "on",
  };
  try {
    if (announcementId) {
      const parsed = announcementIdSchema.safeParse(announcementId);
      if (!parsed.success) return { error: "公告无效" };
      await updateTeamAnnouncement(user.id, teamId.data, parsed.data, { ...fields, version: Number(data.get("version")) });
    } else {
      await createTeamAnnouncement(user.id, teamId.data, fields);
    }
    refreshTeam(teamId.data);
    return { error: "", ok: announcementId ? "公告已更新" : "公告已发布" };
  } catch (error) {
    return { error: toFormError(error, "保存公告失败") };
  }
}

export async function deleteTeamAnnouncementAction(_prev: IdentityFormState, data: FormData): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z.object({ teamId: teamIdSchema, announcementId: announcementIdSchema }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await deleteTeamAnnouncement(user.id, parsed.data.teamId, parsed.data.announcementId, Number(data.get("version")));
    refreshTeam(parsed.data.teamId);
    return { error: "", ok: "公告已删除" };
  } catch (error) {
    return { error: toFormError(error, "删除公告失败") };
  }
}

export async function removeTeamMemberAction(_prev: IdentityFormState, data: FormData): Promise<IdentityFormState> {
  const user = await requireUser();
  const parsed = z.object({ teamId: teamIdSchema, userId: z.uuid({ error: "成员无效" }) }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await removeTeamMember(user.id, parsed.data.teamId, parsed.data.userId);
    refreshTeam(parsed.data.teamId);
    return { error: "", ok: "成员已移出团队" };
  } catch (error) {
    return { error: toFormError(error, "移除成员失败") };
  }
}

export async function leaveTeamAction(_prev: IdentityFormState, data: FormData): Promise<IdentityFormState> {
  const user = await requireUser();
  const teamId = teamIdSchema.safeParse(data.get("teamId"));
  if (!teamId.success) return { error: "团队无效" };
  try {
    await leaveTeam(user.id, teamId.data);
  } catch (error) {
    return { error: toFormError(error, "退出团队失败") };
  }
  refreshTeam(teamId.data);
  redirect("/t");
}
