import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, projects, taskDiscussionPosts, taskDiscussionRevisions, tasks, teamMembers, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { bindDiscussionResources } from "@/modules/resources";
import { notifyTaskDiscussion } from "@/modules/notify";
import { DISCUSSION_LIST_LIMIT, discussionCreateSchema, discussionEditSchema, discussionResolveSchema, type DiscussionCreateInput, type DiscussionEditInput, type DiscussionListDTO, type DiscussionPostDTO, type DiscussionResolveInput, type DiscussionRevisionDTO } from "./client";

type TaskRow = typeof tasks.$inferSelect;
type PostRow = typeof taskDiscussionPosts.$inferSelect;
type Access = { task: TaskRow; teamId: string; capabilities: ReturnType<typeof capabilitiesFor> };

async function taskAccess(actorId: string, taskId: string): Promise<Access> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new NotFoundError("任务不存在");
  const access = await requireProjectForUser(actorId, task.projectId);
  return { task, teamId: access.project.teamId, capabilities: access.capabilities };
}

async function lockTaskAccess(tx: DbTx, actorId: string, access: Access): Promise<Access> {
  await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, access.teamId)).for("update");
  const [project] = await tx.select().from(projects).where(eq(projects.id, access.task.projectId));
  if (!project || project.teamId !== access.teamId) throw new ConflictError("项目归属已变化，请重新加载");
  const [membership] = await tx.select({ role: teamMembers.role, positions: memberPositions.positions })
    .from(teamMembers).leftJoin(memberPositions, eq(memberPositions.membershipId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, access.teamId), eq(teamMembers.userId, actorId)));
  if (!membership) throw new ForbiddenError("你已不在该团队中");
  const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, access.task.id), eq(tasks.projectId, project.id))).for("update");
  if (!task) throw new NotFoundError("任务不存在");
  return { task, teamId: access.teamId, capabilities: capabilitiesFor(membership.positions ?? positionsFromRole(membership.role), project.kind) };
}

function toDTO(row: PostRow, actorId: string, access: Access, authorName: string | null): DiscussionPostDTO {
  const author = row.createdById === actorId;
  return {
    ...row, body: row.withdrawn ? "" : row.body, authorName,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    canEdit: !row.withdrawn && author,
    canWithdraw: !row.withdrawn && (author || access.capabilities.manageMembers),
    canResolve: !row.withdrawn && row.parentId === null && (author || access.task.assigneeId === actorId || access.capabilities.review),
  };
}

async function getPost(actorId: string, taskId: string, postId: string): Promise<DiscussionPostDTO> {
  const access = await taskAccess(actorId, taskId);
  const [row] = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts)
    .leftJoin(users, eq(users.id, taskDiscussionPosts.createdById))
    .where(and(eq(taskDiscussionPosts.id, postId), eq(taskDiscussionPosts.taskId, taskId)));
  if (!row) throw new NotFoundError("讨论不存在");
  return toDTO(row.post, actorId, access, row.authorName);
}

export async function listTaskDiscussions(actorId: string, taskId: string): Promise<DiscussionListDTO> {
  const access = await taskAccess(actorId, taskId);
  const rows = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts)
    .leftJoin(users, eq(users.id, taskDiscussionPosts.createdById)).where(eq(taskDiscussionPosts.taskId, taskId))
    .orderBy(desc(taskDiscussionPosts.createdAt), desc(taskDiscussionPosts.id)).limit(DISCUSSION_LIST_LIMIT + 1);
  const truncated = rows.length > DISCUSSION_LIST_LIMIT;
  const selected = rows.slice(0, DISCUSSION_LIST_LIMIT);
  const selectedIds = new Set(selected.map((row) => row.post.id));
  const missingParents = [...new Set(selected.flatMap((row) => row.post.parentId && !selectedIds.has(row.post.parentId) ? [row.post.parentId] : []))];
  if (missingParents.length) {
    const parents = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts)
      .leftJoin(users, eq(users.id, taskDiscussionPosts.createdById))
      .where(and(eq(taskDiscussionPosts.taskId, taskId), inArray(taskDiscussionPosts.id, missingParents)));
    selected.push(...parents);
    selected.sort((a, b) => b.post.createdAt.getTime() - a.post.createdAt.getTime() || b.post.id.localeCompare(a.post.id));
    // 保留每个可见回复的根讨论，避免查询上限切断上下文。
    while (selected.length > DISCUSSION_LIST_LIMIT) {
      const parentIds = new Set(selected.flatMap((row) => row.post.parentId ? [row.post.parentId] : []));
      const removable = selected.findLastIndex((row) => row.post.parentId !== null || !parentIds.has(row.post.id));
      selected.splice(removable, 1);
    }
  }
  return { posts: selected.reverse().map((row) => toDTO(row.post, actorId, access, row.authorName)), truncated, limit: DISCUSSION_LIST_LIMIT };
}

async function revision(tx: DbTx, row: PostRow, actorId: string, kind: DiscussionRevisionDTO["kind"]) {
  await tx.insert(taskDiscussionRevisions).values({ postId: row.id, version: row.version, body: row.body, changedById: actorId, kind });
}

export async function createTaskDiscussion(actorId: string, taskId: string, input: DiscussionCreateInput): Promise<DiscussionPostDTO> {
  const access = await taskAccess(actorId, taskId);
  const parsed = discussionCreateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const value = parsed.data;
  const postId = await db.transaction(async (tx) => {
    await lockTaskAccess(tx, actorId, access);
    if (value.parentId) {
      const [parent] = await tx.select().from(taskDiscussionPosts).where(and(eq(taskDiscussionPosts.id, value.parentId), eq(taskDiscussionPosts.taskId, taskId))).for("update");
      if (!parent) throw new NotFoundError("原讨论不存在");
      if (parent.parentId !== null) throw new ConflictError("回复只允许一层，请回复原讨论");
      if (parent.withdrawn || parent.resolved) throw new ConflictError("此讨论已撤回或解决，不能继续回复");
    }
    const [created] = await tx.insert(taskDiscussionPosts).values({ taskId, parentId: value.parentId, body: value.body, createdById: actorId }).returning();
    const resources = await bindDiscussionResources(actorId, access.task.projectId, value.resourceIds, created.id, tx);
    await tx.update(taskDiscussionPosts).set({ resources }).where(eq(taskDiscussionPosts.id, created.id));
    await revision(tx, created, actorId, "create");
    await notifyTaskDiscussion(actorId, taskId, created.id, tx);
    return created.id;
  });
  return getPost(actorId, taskId, postId);
}

async function lockedPost(tx: DbTx, taskId: string, postId: string, version: number) {
  const [row] = await tx.select().from(taskDiscussionPosts).where(and(eq(taskDiscussionPosts.id, postId), eq(taskDiscussionPosts.taskId, taskId))).for("update");
  if (!row) throw new NotFoundError("讨论不存在");
  if (row.version !== version) throw new ConflictError("讨论已更新，请保留草稿并重新加载");
  if (row.withdrawn) throw new ConflictError("讨论已撤回");
  return row;
}

export async function updateTaskDiscussion(actorId: string, taskId: string, postId: string, input: DiscussionEditInput): Promise<DiscussionPostDTO> {
  const access = await taskAccess(actorId, taskId);
  const parsed = discussionEditSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await db.transaction(async (tx) => {
    await lockTaskAccess(tx, actorId, access);
    const row = await lockedPost(tx, taskId, postId, parsed.data.version);
    if (row.createdById !== actorId) throw new ForbiddenError("仅作者可编辑此讨论");
    if (!parsed.data.body && !row.resources.length) throw new AppError("请填写讨论内容，已有附件可保留");
    const [updated] = await tx.update(taskDiscussionPosts).set({ body: parsed.data.body, version: row.version + 1, updatedAt: new Date() }).where(eq(taskDiscussionPosts.id, postId)).returning();
    await revision(tx, updated, actorId, "edit");
  });
  return getPost(actorId, taskId, postId);
}

export async function withdrawTaskDiscussion(actorId: string, taskId: string, postId: string, version: number): Promise<DiscussionPostDTO> {
  const access = await taskAccess(actorId, taskId);
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError("讨论版本无效");
  await db.transaction(async (tx) => {
    const current = await lockTaskAccess(tx, actorId, access);
    const row = await lockedPost(tx, taskId, postId, version);
    if (row.createdById !== actorId && !current.capabilities.manageMembers) throw new ForbiddenError("仅作者或团队管理员可撤回此讨论");
    const [updated] = await tx.update(taskDiscussionPosts).set({ withdrawn: true, version: row.version + 1, updatedAt: new Date() }).where(eq(taskDiscussionPosts.id, postId)).returning();
    await revision(tx, updated, actorId, "withdraw");
  });
  return getPost(actorId, taskId, postId);
}

export async function setDiscussionResolved(actorId: string, taskId: string, postId: string, input: DiscussionResolveInput): Promise<DiscussionPostDTO> {
  const access = await taskAccess(actorId, taskId);
  const parsed = discussionResolveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await db.transaction(async (tx) => {
    const current = await lockTaskAccess(tx, actorId, access);
    const row = await lockedPost(tx, taskId, postId, parsed.data.version);
    if (row.parentId !== null) throw new ConflictError("请在原讨论上标记解决或重新打开");
    if (row.createdById !== actorId && current.task.assigneeId !== actorId && !current.capabilities.review) throw new ForbiddenError("仅讨论作者、任务负责人或验收成员可处理此讨论");
    if (row.resolved === parsed.data.resolved) throw new ConflictError("讨论状态已变化，请重新加载");
    const [updated] = await tx.update(taskDiscussionPosts).set({ resolved: parsed.data.resolved, version: row.version + 1, updatedAt: new Date() }).where(eq(taskDiscussionPosts.id, postId)).returning();
    await revision(tx, updated, actorId, parsed.data.resolved ? "resolve" : "reopen");
  });
  return getPost(actorId, taskId, postId);
}

export async function listDiscussionRevisions(actorId: string, taskId: string, postId: string): Promise<DiscussionRevisionDTO[]> {
  await taskAccess(actorId, taskId);
  const [post] = await db.select({ id: taskDiscussionPosts.id }).from(taskDiscussionPosts).where(and(eq(taskDiscussionPosts.id, postId), eq(taskDiscussionPosts.taskId, taskId)));
  if (!post) throw new NotFoundError("讨论不存在");
  return (await db.select({ id: taskDiscussionRevisions.id, version: taskDiscussionRevisions.version, body: taskDiscussionRevisions.body, kind: taskDiscussionRevisions.kind, changedById: taskDiscussionRevisions.changedById, authorName: users.name, createdAt: taskDiscussionRevisions.createdAt })
    .from(taskDiscussionRevisions).leftJoin(users, eq(users.id, taskDiscussionRevisions.changedById))
    .where(eq(taskDiscussionRevisions.postId, postId)).orderBy(asc(taskDiscussionRevisions.version)))
    .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
