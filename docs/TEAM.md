# TEAM.md — 模块 · 分支 · 契约

一份文档说清「谁做什么、接口长什么样、怎么不撞车」。

---

## 1. 模块地图

```
src/modules/
  core/        错误 · 权限 · session · 日期 · 表单     foundation
  identity/    团队 · 成员 · 角色 · 项目               foundation
  tasks/       任务 CRUD · 子任务 · 五态状态机         A
  board/       看板 + 表格 · 筛选 · 拖拽               B
  review/      双端工作台 · 验收台 · 活动流            C
  worklog/     工时 · 完成度 · 贡献（含原 stats）      D
  calendar/    月视图（任务截止 + 里程碑）             E
  milestone/   开题/中期/结题/答辩节点                 E
  notify/      站内消息 + 飞书私信 + cron              E
```

每个模块目录：

```
schema.ts    若有表（可选）
service.ts   纯业务 + ACL
actions.ts   Server Actions 薄壳
api.ts       /api/v1/<m>/* 薄壳
ui/          本模块 React 组件
index.ts     唯一对外契约
client.ts    可选：浏览器安全的公开纯函数/类型
ui.tsx       可选：公开客户端组件
views.tsx    可选：公开服务端页面组合
```

数据表归属：`users/teams/team_members/projects` → identity · `tasks` → tasks · `milestones` → milestone · `worklogs` → worklog · `task_acceptance_events` → review · `notifications` → notify。
`src/db/schema.ts` 是 barrel，本期集中放一份，**只追加不重排**。

---

## 2. 分支 ↔ Owner

```
main  ──  可部署
 └─ develop ──  集成
     ├─ feature/tasks-status       A
     ├─ feature/board-views        B
     ├─ feature/review-portal      C
     ├─ feature/worklog-stats      D
     ├─ feature/calendar-notify    E
     └─ test/contract-suite        E + 全员
```

| 人 | 分支 | 模块 | 路由 |
|---|---|---|---|
| foundation | `chore/foundation` | core · identity · ui · lib | `/login` `/register` `/t/*` `/settings` `/api/auth/**` |
| A | `feature/tasks-status` | tasks | `/p/[id]/tasks/**` |
| B | `feature/board-views` | board | `/p/[id]/board` `/p/[id]/table` |
| C | `feature/review-portal` | review | `/home/student` `/home/teacher` `/p/[id]/review` |
| D | `feature/worklog-stats` | worklog | `/p/[id]/stats`（工时面板嵌任务详情） |
| E | `feature/calendar-notify` | calendar · milestone · notify | `/p/[id]/{calendar,milestones}` `/api/cron/**` |

### 冲突面规则

1. 默认**不跨 Owner 目录改文件**。用户明确授权的跨模块体验迭代先登记范围，按 Owner 分别评审；本次集成范围为 identity、tasks、board 和相关共享 UI。要动 core / `package.json` → `feature/core-patch/<slug>` 或开 issue。
2. 路由文件只做壳，业务写在模块 `service.ts`。
3. schema 只追加到 `src/db/schema.ts` 末尾并注释 `// <module>`。
4. 依赖只在 foundation 阶段加；后续加依赖先声明理由。
5. PR 必须 Windows 上 `npm test` + `npm run build` 全绿。

---

## 3. 公开契约（`index.ts`）

> 填实 stub 后**必须**更新本节。`tests/contract/exports.test.ts` 做静态断言。

### `@/modules/core`

```ts
AppError / ForbiddenError / NotFoundError / ConflictError / NotImplementedError
isUniqueViolation(e): boolean

requireUser() / tryUser()

getProjectForUser(actorId, projectId)
requireProjectForUser(actorId, projectId)
getTeamMembership(userId, teamId)
requireTeamRole(userId, teamId, allowed: TeamRole[])
requireTaskWrite(actorId, projectId)      // admin + student
requireReviewer(actorId, projectId)       // admin + teacher

todayISO(d?) / isValidISODate(s) / addDaysISO(iso, days) / daysBetween(from, to)
isOverdue(due, today?) / isDueSoon(due, withinDays?, today?)
formatMinutes(mins) / monthGrid(year, month)

type FormState = { error: string } | null
toFormError(e, fallback?): string
```

### `@/modules/identity`

```ts
createTeam(userId, name)
joinTeam(userId, inviteCode)
listMyTeams(userId)
listTeamSpaces(actorId)                   // 当前用户的空间，含 memberCount / projectCount（active）
listTeamMembers(actorId, teamId)          // 必须先检查团队访问权限
updateMemberRole(actorId, teamId, targetUserId, role)
createProject(actorId, teamId, input)
listTeamProjects(actorId, teamId)
updateProject(actorId, projectId, patch)
listMyProjects(actorId)
// re-export: getTeamMembership / getProjectForUser / requireTeamRole
```

`createTeam`/`createProject` 校验并去除名称首尾空白；项目日期校验真实日历日期及开始≤结束。`updateMemberRole` 在事务中锁定团队，拒绝降级最后一位管理员。公开 UI：`identity/ui` 提供场景选择、创建/加入、成员角色与邀请码组件；`identity/views` 提供团队、成员、项目和项目概览页面。团队场景是引导选择，数据库实体仍为团队，课程/实验室/竞赛类型存于项目。

### `@/modules/tasks`（A）

```ts
type TaskDTO / TaskPatch / TransitionInput / TransitionAction

listProjectTasks(actorId, projectId, filters?)
getTaskDetail(actorId, taskId)                    // 含 subtasks
createTask(actorId, projectId, input)
updateTask(actorId, taskId, patch)
deleteTask(actorId, taskId)
transitionTask(actorId, taskId, action, input?)   // 唯一状态入口
createSubtask(actorId, parentTaskId, input)
listSubtasks(actorId, parentTaskId)
setDueDate(actorId, taskId, dueDate)

availableTransitions(task: { status, assigneeId }, role, actorId): TransitionRule[]
STATUS_DESCRIPTIONS / canDeleteTask(role)
```

状态机唯一真相是模块内部 `states.ts` 的 `TRANSITIONS`，外部通过 `@/modules/tasks` 或浏览器安全的 `@/modules/tasks/client` 使用。`availableTransitions` 同时处理状态、角色和学生负责人权限，`claim` 由当前用户认领，管理员保留代提交权限。`transitionTask` 在行锁事务中同时写状态与活动事件，通知在提交后发送。公开 UI：`tasks/ui` 的 `TaskWorkflow`、`TaskActions`、`TransitionDialog`、`CreateTaskForm`；`tasks/views` 的任务池与详情组合。详情页必须检查 URL 的 projectId 与任务归属一致。

### `@/modules/board`（B）

```ts
deriveColumns(tasks, groupBy)
applyFilters(tasks, f)
parseFilters(params) / serializeFilters(f)
moveTask(actorId, taskId, patch)   // 只调 tasks.updateTask / transitionTask
getMoveTransition(task, targetStatus, role, actorId): TransitionRule | null
type MovePatch = { status?, assigneeId?, priority?, milestoneId?, sortOrder?, note? }
movePatchSchema
```

`BoardFilters` 增加 `q?: string`，搜索标题和描述；URL 保留状态、负责人、优先级、里程碑和搜索。状态移动支持 `note`，提交/重交/打回均不能省略说明。状态、负责人和属性分别提交，组合写入会明确拒绝，避免丢弃半个操作。API `deriveColumns` 的历史五列顺序保持兼容；页面用 `BOARD_STATUS_ORDER` 展示待认领→进行中→待验收→待修改→已完成，并单独说明打回分支。只有按状态分组支持拖动；其他分组用于浏览。公开 UI：`board/client`（纯函数）、`board/ui`（`ProjectWorkspace`）、`board/views`（页面组合）。

### `@/modules/review`（C）

```ts
listMyTodo(actorId) / listMyInProgress(actorId) / listMyRejected(actorId)
listUnclaimedPool(actorId, projectId)
listPendingReview(actorId, projectId)
listOverdueRisks(actorId, projectId)
listTaskEvents(actorId, taskId)
```

### `@/modules/worklog`（D，含 stats）

```ts
addWorklog(actorId, taskId, input) / listWorklogs(actorId, taskId) / deleteWorklog(actorId, worklogId)
completionRatio(actorId, taskId) / projectCompletion(actorId, projectId)
taskHours(actorId, projectId, range?)
memberContribution(actorId, projectId)
```

### `@/modules/calendar`（E）

```ts
monthView(actorId, projectId, year, month)   // month: 1-12
```

### `@/modules/milestone`（E）

```ts
listMilestones(actorId, projectId)
createMilestone(actorId, projectId, input)
updateMilestone(actorId, milestoneId, patch)
deleteMilestone(actorId, milestoneId)
```

### `@/modules/notify`（E）

```ts
notifyAssigned(taskId) / notifySubmitted(taskId) / notifyAccepted(taskId) / notifyRejected(taskId, reason)
scanAndNotifyDue()                            // cron
listMyNotifications(actorId, opts?) / markRead(actorId, id)
```

---

## 4. PR 检查清单

- [ ] 模块归属正确（上表）
- [ ] 契约签名变了？→ 已同步本文档第 3 节
- [ ] 契约测试 ≥ 6 条（happy + 越权 + 非法状态转移）
- [ ] Windows：`npm test` + `npm run build` 绿
- [ ] 未改不属于自己的目录

Commit 用 Conventional Commits：`feat(tasks): 五态状态机` · `fix(board): 非法拖拽回滚` · `test(review): 越权矩阵`
