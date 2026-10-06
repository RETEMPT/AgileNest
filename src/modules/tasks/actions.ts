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
} from "@/modules/tasks";
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
    });
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
});

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
    const task = await transitionTask(
      user.id,
      parsed.data.taskId,
      parsed.data.action,
      { note: parsed.data.note, assigneeId: parsed.data.assigneeId },
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
