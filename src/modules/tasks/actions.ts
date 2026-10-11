"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, AppError, getProjectForUser } from "@/modules/core";
import {
  createTask,
  deleteTask,
  transitionTask,
  updateTask,
  getTaskDetail,
  createSubtask,
  getTaskDelivery,
  saveTaskRequirements,
} from "@/modules/tasks";
import { transitionBodySchema, requirementsSchema } from "./delivery-validation";
import type { TaskDeliveryDTO } from "./delivery-types";
import { listTeamMembers } from "@/modules/identity";
import { addWorklog } from "@/modules/worklog";
import { createMilestone } from "@/modules/milestone";

export type FormState = { error: string; ok?: string } | null;

export async function editTaskAction(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const taskId = z.uuid().safeParse(data.get("taskId"));
  if (!taskId.success) return { error: "任务无效" };
  try {
    const priority = z
      .enum(["low", "medium", "high"])
      .safeParse(data.get("priority"));
    if (!priority.success) return { error: "请选择优先级" };
    const updated = await updateTask(user.id, taskId.data, {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      startDate: String(data.get("startDate") ?? "") || null,
      dueDate: String(data.get("dueDate") ?? "") || null,
      milestoneId: String(data.get("milestoneId") ?? "") || null,
      estimatedMinutes: data.get("estimatedMinutes")
        ? Number(data.get("estimatedMinutes"))
        : null,
      priority: priority.data,
    }, z.iso.datetime("编辑版本无效，请重新打开任务").parse(data.get("expectedUpdatedAt")));
    revalidatePath(`/p/${updated.projectId}`, "layout");
    revalidatePath("/home", "layout");
    revalidatePath("/t", "layout");
    return { error: "", ok: "任务信息已保存" };
  } catch (error) {
    return fail(error);
  }
}

function fail(e: unknown): FormState {
  if (e instanceof AppError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "输入不符合要求" };
  console.error("[actions]", e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("5432")) {
    return { error: "数据库连接中断，请确认本地 Postgres 服务正在运行。" };
  }
  return { error: "操作失败，请稍后重试" };
}

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "请填写标题").max(200, "标题最多 200 字"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assigneeId: z.string().optional(),
  acceptanceCriteria: z.string().min(1, "请填写发布任务的验收清单"),
  requestKey: z.uuid("发布请求无效，请重新开始创建任务"),
});

function publicationCriteria(value: string) {
  const parsed = requirementsSchema.parse({ version: 0, criteria: JSON.parse(value) as unknown });
  if (!parsed.criteria.length) throw new AppError("发布任务至少需要一项验收要求");
  return parsed.criteria;
}

export async function createTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const input = {
      title: parsed.data.title,
      description: parsed.data.description || undefined,
      dueDate: parsed.data.dueDate || undefined,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId || undefined,
      acceptanceCriteria: publicationCriteria(parsed.data.acceptanceCriteria),
      requestKey: parsed.data.requestKey,
    };
    await createTask(user.id, parsed.data.projectId, input);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}`, "layout");
  revalidatePath("/home", "layout");
  revalidatePath("/t");
  return { error: "", ok: "已创建" };
}

const subtaskSchema = createSchema
  .omit({ projectId: true })
  .extend({ parentTaskId: z.uuid("父任务无效") });

export async function createSubtaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = subtaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const sub = await createSubtask(user.id, parsed.data.parentTaskId, {
      title: parsed.data.title,
      description: parsed.data.description || undefined,
      dueDate: parsed.data.dueDate || undefined,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId || undefined,
      acceptanceCriteria: publicationCriteria(parsed.data.acceptanceCriteria),
      requestKey: parsed.data.requestKey,
    });
    revalidatePath(`/p/${sub.projectId}`, "layout");
    revalidatePath("/home", "layout");
    revalidatePath("/t", "layout");
  } catch (error) {
    return fail(error);
  }
  return { error: "", ok: "已创建子任务" };
}

const transitionSchema = z.object({
  taskId: z.uuid("任务无效"),
  action: z.enum(
    [
      "claim",
      "unclaim",
      "assign",
      "submit",
      "resubmit",
      "accept",
      "reject",
      "reopen",
    ],
    { error: "无效的状态操作" },
  ),
  note: z.string().trim().max(5000, "说明最多 5000 字").optional(),
  assigneeId: z.uuid("请选择团队成员").optional(),
});

export async function transitionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let projectId: string;
  try {
    const body = transitionBodySchema.safeParse({
      ...parsed.data,
      delivery: formData.has("delivery") ? JSON.parse(String(formData.get("delivery"))) as unknown : undefined,
      review: formData.has("review") ? JSON.parse(String(formData.get("review"))) as unknown : undefined,
    });
    if (!body.success) return { error: body.error.issues[0].message };
    const task = await transitionTask(
      user.id,
      parsed.data.taskId,
      parsed.data.action,
      body.data,
    );
    projectId = task.projectId;
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath(`/t`);
  revalidatePath("/home", "layout");
  return { error: "", ok: "已更新" };
}

export async function loadTaskDeliveryAction(taskId: string): Promise<{ error: string; delivery?: TaskDeliveryDTO }> {
  const user = await requireUser();
  try {
    return { error: "", delivery: await getTaskDelivery(user.id, z.uuid("任务无效").parse(taskId)) };
  } catch (error) { return { error: fail(error)?.error ?? "无法加载提交要求" }; }
}

export async function saveTaskRequirementsAction(_previous: FormState, data: FormData) {
  const user = await requireUser();
  try {
    const taskId = z.uuid("任务无效").parse(data.get("taskId"));
    const input = requirementsSchema.parse({ version: Number(data.get("version")), criteria: JSON.parse(String(data.get("criteria"))) as unknown });
    const requirements = await saveTaskRequirements(user.id, taskId, input);
    const task = await getTaskDetail(user.id, taskId);
    revalidatePath(`/p/${task.projectId}`, "layout");
    revalidatePath("/home", "layout");
    return { error: "", ok: "验收要求已保存", requirements };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    return fail(error);
  }
}

export async function loadTaskAssigneesAction(taskId: string) {
  const user = await requireUser();
  try {
    const task = await getTaskDetail(user.id, z.uuid().parse(taskId));
    const access = await getProjectForUser(user.id, task.projectId);
    if (!access || !access.capabilities.task.actions.includes("assign"))
      throw new AppError("没有指派权限", 403);
    const members = await listTeamMembers(user.id, access.project.teamId);
    return {
      members: members.map(({ id, name, role, positions, canExecute }) => ({
        id,
        name,
        role,
        positions,
        canExecute,
      })),
      error: "",
    };
  } catch (error) {
    return { members: [], error: fail(error)?.error ?? "加载成员失败" };
  }
}

export async function loadProjectTaskAssigneesAction(projectId: string) {
  const user = await requireUser();
  try {
    const access = await getProjectForUser(user.id, z.uuid("项目无效").parse(projectId));
    if (!access || !access.capabilities.task.actions.includes("create")) throw new AppError("没有发布任务权限", 403);
    const canAssign = access.capabilities.task.actions.includes("assign");
    const members = (await listTeamMembers(user.id, access.project.teamId)).filter((member) => member.canExecute && (canAssign || member.id === user.id));
    return { members: members.map(({ id, name, role, positions, canExecute }) => ({ id, name, role, positions, canExecute })), canAssign, error: "" };
  } catch (error) { return { members: [], canAssign: false, error: fail(error)?.error ?? "无法加载任务负责人" }; }
}

export async function loadTaskPermissionsAction(taskId: string) {
  const user = await requireUser();
  try {
    const task = await getTaskDetail(user.id, z.uuid().parse(taskId));
    return { permissions: task.permissions, error: "" };
  } catch (error) {
    return {
      permissions: undefined,
      error: fail(error)?.error ?? "加载操作失败",
    };
  }
}

export async function deleteTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  let projectId: string;
  if (!taskId) return { error: "缺少任务" };
  try {
    projectId = (await getTaskDetail(user.id, taskId)).projectId;
    await deleteTask(user.id, taskId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${projectId}`, "layout");
  revalidatePath("/home", "layout");
  revalidatePath("/t", "layout");
  return { error: "", ok: "已删除" };
}

const worklogSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  workDate: z.string().min(1),
  minutes: z.coerce.number().int().positive("工时需为正整数分钟"),
  note: z.string().optional(),
});

export async function addWorklogAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = worklogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await addWorklog(user.id, parsed.data.taskId, {
      workDate: parsed.data.workDate,
      minutes: parsed.data.minutes,
      note: parsed.data.note || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  revalidatePath(`/p/${parsed.data.projectId}/stats`);
  return { error: "", ok: "已记工时" };
}

const milestoneSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "请填写标题"),
  kind: z
    .enum(["open_topic", "midterm", "final", "defense", "custom"])
    .optional(),
  targetDate: z.string().optional(),
});

export async function createMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = milestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createMilestone(user.id, parsed.data.projectId, {
      title: parsed.data.title,
      kind: parsed.data.kind,
      targetDate: parsed.data.targetDate || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/milestones`);
  return { error: "", ok: "已创建" };
}

const dueSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  dueDate: z.string().optional(),
});

export async function setDueDateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = dueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await updateTask(user.id, parsed.data.taskId, {
      dueDate: parsed.data.dueDate || null,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/p/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return { error: "", ok: "已改截止日期" };
}
