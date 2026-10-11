import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { memberPositions, projects, taskDiscussionMentions, taskDiscussionPosts, taskDiscussionRevisions, tasks, teamMembers, teams, users } from "@/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, requireProjectForUser } from "@/modules/core";
import { capabilitiesFor, positionsFromRole } from "@/modules/identity/client";
import { bindDiscussionResources } from "@/modules/resources";
import { enqueueCollaborationNotice, notifyTaskDiscussion } from "@/modules/notify";
import { z } from "zod";
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

function toDTO(row: PostRow, actorId: string, access: Access, authorName: string | null, mentions: { userId: string; name: string }[] = []): DiscussionPostDTO {
  const author = row.createdById === actorId;
  return {
    ...row, body: row.withdrawn ? "" : row.body, authorName, mentions,
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
  const mentions = await mentionRows([row.post]);
  return toDTO(row.post, actorId, access, row.authorName, mentions.get(`${postId}:${row.post.version}`));
}

async function mentionRows(posts: readonly Pick<PostRow, "id" | "version">[]) {
  const result = new Map<string, { userId: string; name: string }[]>();
  if (!posts.length) return result;
  const rows = await db.select().from(taskDiscussionMentions).where(inArray(taskDiscussionMentions.postId, posts.map((post) => post.id)));
  for (const row of rows) {
    const key = `${row.postId}:${row.version}`;
    const existing = result.get(key) ?? [];
    existing.push({ userId: row.userId, name: row.nameSnapshot }); result.set(key, existing);
  }
  return result;
}

export async function listDiscussionMembers(actorId: string, taskId: string) {
  const access = await taskAccess(actorId, taskId);
  return db.select({ userId: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, access.teamId)).orderBy(asc(users.name), asc(users.id));
}

async function writeMentions(tx: DbTx, teamId: string, postId: string, version: number, userIds: readonly string[]) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const rows = await tx.select({ userId: users.id, name: users.name }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), inArray(teamMembers.userId, unique)));
  if (rows.length !== unique.length) throw new ForbiddenError("只能提及当前团队中的成员，请刷新成员列表");
  await tx.insert(taskDiscussionMentions).values(rows.map((row) => ({ postId, version, userId: row.userId, nameSnapshot: row.name })));
}

async function carryMentions(tx: DbTx, postId: string, fromVersion: number, toVersion: number) {
  const rows = await tx.select().from(taskDiscussionMentions).where(and(eq(taskDiscussionMentions.postId, postId), eq(taskDiscussionMentions.version, fromVersion)));
  if (rows.length) await tx.insert(taskDiscussionMentions).values(rows.map((row) => ({ postId, version: toVersion, userId: row.userId, nameSnapshot: row.nameSnapshot })));
  return rows;
}

export async function listTaskDiscussions(actorId: string, taskId: string, input: { before?: string; around?: string } = {}): Promise<DiscussionListDTO> {
  const access = await taskAccess(actorId, taskId);
  const query = z.object({ before: z.uuid().optional(), around: z.uuid().optional() }).safeParse(input);
  if (!query.success) throw new AppError("讨论分页参数无效");
  const [cursor] = query.data.before ? await db.select().from(taskDiscussionPosts).where(and(eq(taskDiscussionPosts.id, query.data.before), eq(taskDiscussionPosts.taskId, taskId))) : [];
  if (query.data.before && !cursor) throw new NotFoundError("较早讨论不存在，请刷新列表");
  const rows = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts)
    .leftJoin(users, eq(users.id, taskDiscussionPosts.createdById)).where(and(eq(taskDiscussionPosts.taskId, taskId), cursor ? or(lt(taskDiscussionPosts.createdAt, cursor.createdAt), and(eq(taskDiscussionPosts.createdAt, cursor.createdAt), lt(taskDiscussionPosts.id, cursor.id))) : undefined))
    .orderBy(desc(taskDiscussionPosts.createdAt), desc(taskDiscussionPosts.id)).limit(DISCUSSION_LIST_LIMIT + 1);
  let truncated = rows.length > DISCUSSION_LIST_LIMIT;
  const page = rows.slice(0, DISCUSSION_LIST_LIMIT);
  const selected = [...page];
  const protectedIds = new Set<string>();
  if (query.data.around) {
    const [focused] = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts).leftJoin(users, eq(users.id, taskDiscussionPosts.createdById))
      .where(and(eq(taskDiscussionPosts.id, query.data.around), eq(taskDiscussionPosts.taskId, taskId)));
    if (focused) {
      protectedIds.add(focused.post.id);
      if (focused.post.parentId) protectedIds.add(focused.post.parentId);
      if (!selected.some((row) => row.post.id === focused.post.id)) selected.push(focused);
    }
  }
  const selectedIds = new Set(selected.map((row) => row.post.id));
  const missingParents = [...new Set(selected.flatMap((row) => row.post.parentId && !selectedIds.has(row.post.parentId) ? [row.post.parentId] : []))];
  if (missingParents.length) {
    const parents = await db.select({ post: taskDiscussionPosts, authorName: users.name }).from(taskDiscussionPosts)
      .leftJoin(users, eq(users.id, taskDiscussionPosts.createdById))
      .where(and(eq(taskDiscussionPosts.taskId, taskId), inArray(taskDiscussionPosts.id, missingParents)));
    selected.push(...parents);
    selected.sort((a, b) => b.post.createdAt.getTime() - a.post.createdAt.getTime() || b.post.id.localeCompare(a.post.id));
  }
  selected.sort((a, b) => b.post.createdAt.getTime() - a.post.createdAt.getTime() || b.post.id.localeCompare(a.post.id));
  // 保留回复的主题和通知定位；游标停在被裁掉的原始页之前，避免漏掉旧记录。
  while (selected.length > DISCUSSION_LIST_LIMIT) {
    const parentIds = new Set(selected.flatMap((row) => row.post.parentId ? [row.post.parentId] : []));
    const removable = selected.findLastIndex((row) => !protectedIds.has(row.post.id) && (row.post.parentId !== null || !parentIds.has(row.post.id)));
    selected.splice(removable, 1);
  }
  const retainedIds = new Set(selected.map((row) => row.post.id));
  const firstMissing = page.findIndex((row) => !retainedIds.has(row.post.id));
  if (firstMissing >= 0) truncated = true;
  const nextCursor = truncated ? page[(firstMissing >= 0 ? firstMissing : page.length) - 1]?.post.id ?? null : null;
  selected.sort((a, b) => a.post.createdAt.getTime() - b.post.createdAt.getTime() || a.post.id.localeCompare(b.post.id));
  const mentions = await mentionRows(selected.map((row) => row.post));
  return { posts: selected.map((row) => toDTO(row.post, actorId, access, row.authorName, mentions.get(`${row.post.id}:${row.post.version}`))), truncated, limit: DISCUSSION_LIST_LIMIT, nextCursor };
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
    await writeMentions(tx, access.teamId, created.id, created.version, value.mentionedUserIds);
    await notifyTaskDiscussion(actorId, taskId, created.id, tx, value.mentionedUserIds);
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
    const oldMentions = await tx.select().from(taskDiscussionMentions).where(and(eq(taskDiscussionMentions.postId, postId), eq(taskDiscussionMentions.version, row.version)));
    const mentionedUserIds = parsed.data.mentionedUserIds ?? oldMentions.map((mention) => mention.userId);
    if (parsed.data.mentionedUserIds) await writeMentions(tx, access.teamId, postId, updated.version, mentionedUserIds);
    else await carryMentions(tx, postId, row.version, updated.version);
    await enqueueCollaborationNotice(actorId, { target: { kind: "task", id: taskId }, event: "discussion", title: `讨论更新：${access.task.title}`.slice(0, 200), body: updated.body.slice(0, 300), link: `/p/${access.task.projectId}/tasks/${taskId}#discussion-${postId}`, mentionedUserIds: mentionedUserIds.filter((userId) => !oldMentions.some((old) => old.userId === userId)), eventKey: `discussion-edit:${postId}:${updated.version}` }, tx);
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
    await carryMentions(tx, postId, row.version, updated.version);
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
    await carryMentions(tx, postId, row.version, updated.version);
  });
  return getPost(actorId, taskId, postId);
}

export async function listDiscussionRevisions(actorId: string, taskId: string, postId: string): Promise<DiscussionRevisionDTO[]> {
  await taskAccess(actorId, taskId);
  const [post] = await db.select({ id: taskDiscussionPosts.id }).from(taskDiscussionPosts).where(and(eq(taskDiscussionPosts.id, postId), eq(taskDiscussionPosts.taskId, taskId)));
  if (!post) throw new NotFoundError("讨论不存在");
  const revisions = await db.select({ id: taskDiscussionRevisions.id, version: taskDiscussionRevisions.version, body: taskDiscussionRevisions.body, kind: taskDiscussionRevisions.kind, changedById: taskDiscussionRevisions.changedById, authorName: users.name, createdAt: taskDiscussionRevisions.createdAt })
    .from(taskDiscussionRevisions).leftJoin(users, eq(users.id, taskDiscussionRevisions.changedById))
    .where(eq(taskDiscussionRevisions.postId, postId)).orderBy(asc(taskDiscussionRevisions.version));
  const mentions = await mentionRows([{ id: postId, version: 1 }]);
  return revisions.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), mentions: mentions.get(`${postId}:${row.version}`) ?? [] }));
}
